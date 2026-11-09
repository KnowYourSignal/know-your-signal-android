package com.knowyoursignal.sync

import com.knowyoursignal.BuildConfig
import com.knowyoursignal.data.NOTICE_VERSION
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONException
import org.json.JSONObject

internal data class SyncConfig(val url: HttpUrl, val publishableKey: String) {
    val server = url.toString().trimEnd('/')

    companion object {
        fun load(): SyncConfig? {
            val key = BuildConfig.SUPABASE_PUBLISHABLE_KEY
            val url = BuildConfig.SUPABASE_URL.toHttpUrlOrNull() ?: return null
            if (!key.startsWith("sb_publishable_") || !url.isHttps || url.encodedPath != "/" ||
                url.username.isNotEmpty() || url.password.isNotEmpty() || url.query != null || url.fragment != null
            ) return null
            return SyncConfig(url, key)
        }
    }
}

internal class SyncFailure(val code: String, val retryable: Boolean, val status: Int = 0) : Exception(code)
internal class ConsentChanged : Exception()

internal data class BatchReceipt(val confirmed: List<String>, val rejected: List<String>, val retry: Boolean) {
    companion object {
        fun parse(data: JSONObject, expected: Set<String>): BatchReceipt {
            val seen = HashSet<String>()
            val confirmed = mutableListOf<String>()
            val rejected = mutableListOf<String>()
            var retry = false
            fun consume(id: String): String {
                if (id !in expected || !seen.add(id)) throw JSONException("Invalid receipt ID")
                return id
            }
            for (field in listOf("aceptadas", "duplicadas")) {
                val list = data.getJSONArray(field)
                for (index in 0 until list.length()) confirmed.add(consume(list.getString(index)))
            }
            val declined = data.getJSONArray("rechazadas")
            for (index in 0 until declined.length()) {
                val item = declined.getJSONObject(index)
                val id = consume(item.getString("id"))
                if (item.getBoolean("reintentable")) retry = true else rejected.add(id)
            }
            if (seen != expected) throw JSONException("Incomplete receipt")
            return BatchReceipt(confirmed, rejected, retry)
        }
    }
}

internal class SyncApi(
    private val config: SyncConfig,
    private val client: OkHttpClient = sharedClient,
) {
    suspend fun signIn(gate: RequestGate) = session(
        post("auth/v1/signup", JSONObject().put("data", JSONObject()), gate = gate),
    )

    suspend fun refresh(token: String, gate: RequestGate) = session(
        post("auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", token), gate = gate),
    )

    suspend fun setConsent(enabled: Boolean, token: String, gate: RequestGate) {
        post("rest/v1/rpc/set_consent",
            JSONObject().put("p_habilitado", enabled).put("p_version_aviso", NOTICE_VERSION),
            token, gate)
    }

    suspend fun ingest(payload: JSONObject, token: String, ids: Set<String>, gate: RequestGate): BatchReceipt {
        val response = post("functions/v1/ingest-measurements", payload, token, gate)
        return parseJson { BatchReceipt.parse(JSONObject(response), ids) }
    }

    private fun session(json: String): AuthSession = parseJson {
        val data = JSONObject(json)
        val access = data.getString("access_token")
        val refresh = data.getString("refresh_token")
        val expiresIn = data.getLong("expires_in")
        if (access.isBlank() || refresh.isBlank() || expiresIn <= 0) throw JSONException("Missing session")
        AuthSession(access, refresh, System.currentTimeMillis() + expiresIn.coerceAtMost(86_400L) * 1_000)
    }

    private suspend fun post(path: String, body: JSONObject, token: String? = null, gate: RequestGate): String {
        val builder = Request.Builder().url(requireNotNull(config.url.resolve(path)))
            .header("apikey", config.publishableKey)
            .header("Accept", "application/json")
            .post(body.toString().toRequestBody(JSON))
        if (token != null) builder.header("Authorization", "Bearer $token")
        val call = client.newCall(builder.build())
        val result = CompletableDeferred<HttpResult>()
        try {
            gate(call) {
                call.enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        result.completeExceptionally(SyncFailure("NETWORK", retryable = true))
                    }

                    override fun onResponse(call: Call, response: Response) {
                        response.use {
                            try {
                                // The strict batch contract keeps response bodies small.
                                val text = it.peekBody(256 * 1024L).string()
                                result.complete(HttpResult(it.code, text))
                            } catch (_: IOException) {
                                result.completeExceptionally(SyncFailure("NETWORK", retryable = true))
                            }
                        }
                    }
                })
            }
            val response = result.await()
            if (response.status !in 200..299) throw httpFailure(response.status)
            return response.body
        } finally {
            call.cancel()
        }
    }

    private fun httpFailure(status: Int) = when {
        status == 429 -> SyncFailure("RATE_LIMITED", true, status)
        status >= 500 || status == 408 -> SyncFailure("SERVICE_UNAVAILABLE", true, status)
        status == 401 -> SyncFailure("SESSION_EXPIRED", false, status)
        status == 403 -> SyncFailure("CONSENT_BLOCKED", false, status)
        else -> SyncFailure("SERVER_REJECTED", false, status)
    }

    private inline fun <T> parseJson(block: () -> T): T = try {
        block()
    } catch (_: JSONException) {
        throw SyncFailure("INVALID_RESPONSE", retryable = true)
    }

    private data class HttpResult(val status: Int, val body: String)

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val sharedClient = OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .followRedirects(false)
            .followSslRedirects(false)
            .retryOnConnectionFailure(false)
            .build()
    }
}

internal typealias RequestGate = suspend (Call, () -> Unit) -> Unit

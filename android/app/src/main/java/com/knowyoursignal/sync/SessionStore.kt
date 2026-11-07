package com.knowyoursignal.sync

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal data class AuthSession(val accessToken: String, val refreshToken: String, val expiresAtMs: Long)

internal class SessionStore(context: Context, server: String) {
    private val preferences = context.getSharedPreferences("fieldwork_sessions", Context.MODE_PRIVATE)
    private val entry = "session:$server"
    private val alias = "knowyoursignal-session"

    fun read(): AuthSession? {
        val value = preferences.getString(entry, null) ?: return null
        return secureStorage {
            val (iv, encrypted) = value.split('.', limit = 2)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
            val data = JSONObject(String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8))
            AuthSession(data.getString("access"), data.getString("refresh"), data.getLong("expires"))
        }
    }

    fun write(session: AuthSession) = secureStorage {
        val data = JSONObject()
            .put("access", session.accessToken)
            .put("refresh", session.refreshToken)
            .put("expires", session.expiresAtMs)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(entry.toByteArray(Charsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val encrypted = Base64.encodeToString(cipher.doFinal(data.toString().toByteArray()), Base64.NO_WRAP)
        check(preferences.edit().putString(entry, "$iv.$encrypted").commit())
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
            generateKey()
        }
    }

    private inline fun <T> secureStorage(block: () -> T): T = try {
        block()
    } catch (_: Exception) {
        throw SyncFailure("SESSION_STORAGE", retryable = false)
    }
}

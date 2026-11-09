package com.knowyoursignal.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [MeasurementEntity::class, OutboxEntity::class, ConsentEntity::class],
    version = 2,
    exportSchema = true,
)
internal abstract class FieldDatabase : RoomDatabase() {
    abstract fun measurements(): MeasurementDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE measurements ADD COLUMN classificationOrigin TEXT NOT NULL DEFAULT 'sistema'")
                db.execSQL("UPDATE measurements SET classificationOrigin = 'desconocido' WHERE connection = 'wifi_desconocida'")
            }
        }
        @Volatile private var instance: FieldDatabase? = null

        fun open(context: Context): FieldDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext, FieldDatabase::class.java, "fieldwork.db",
            ).addMigrations(MIGRATION_1_2).build().also { instance = it }
        }
    }
}

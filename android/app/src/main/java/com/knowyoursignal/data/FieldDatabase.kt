package com.knowyoursignal.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [MeasurementEntity::class, OutboxEntity::class, ConsentEntity::class],
    version = 1,
    exportSchema = true,
)
internal abstract class FieldDatabase : RoomDatabase() {
    abstract fun measurements(): MeasurementDao

    companion object {
        @Volatile private var instance: FieldDatabase? = null

        fun open(context: Context): FieldDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext, FieldDatabase::class.java, "fieldwork.db",
            ).build().also { instance = it }
        }
    }
}

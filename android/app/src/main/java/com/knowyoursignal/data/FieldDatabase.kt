package com.knowyoursignal.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [MeasurementEntity::class, OutboxEntity::class, ConsentEntity::class, SessionEntity::class],
    version = 3,
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
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `sessions` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `startedAt` TEXT NOT NULL, PRIMARY KEY(`id`))")
                db.execSQL("INSERT OR IGNORE INTO `sessions` VALUES ('session-1', 'Sesión 1', '2026-11-09T00:00:00.000Z')")
                db.execSQL("ALTER TABLE `measurements` ADD COLUMN `sessionId` TEXT NOT NULL DEFAULT 'session-1' REFERENCES `sessions`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_measurements_sessionId` ON `measurements` (`sessionId`)")
            }
        }
        @Volatile private var instance: FieldDatabase? = null

        fun open(context: Context): FieldDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext, FieldDatabase::class.java, "fieldwork.db",
            ).addMigrations(MIGRATION_1_2, MIGRATION_2_3).build().also { instance = it }
        }
    }
}

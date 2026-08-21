import { pgTable, text, timestamp, jsonb, varchar, integer } from 'drizzle-orm/pg-core';

/**
 * Minimal scaffold schema — expanded in follow-up DB/migration issues (#210).
 * Public snapshots remain Zod-defined in @santa-tracker/contracts; these tables
 * store drafts, editorial metadata, and publication records.
 */

export const publications = pgTable('publications', {
  id: varchar('id', { length: 64 }).primaryKey(),
  season: integer('season').notNull(),
  schemaVersion: varchar('schema_version', { length: 32 }).notNull(),
  checksum: varchar('checksum', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  author: varchar('author', { length: 128 }).notNull(),
  snapshot: jsonb('snapshot').notNull().$type<unknown>(),
});

export const locations = pgTable('locations', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  data: jsonb('data').notNull().$type<unknown>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable('audit_events', {
  id: varchar('id', { length: 64 }).primaryKey(),
  action: varchar('action', { length: 64 }).notNull(),
  actor: varchar('actor', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<unknown>(),
});

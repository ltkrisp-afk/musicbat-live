import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  artistId: text("artist_id").notNull(),
  artistName: text("artist_name").notNull(),
  title: text("title").notNull(),
  audioUrl: text("audio_url").notNull(),
  rightsAttested: integer("rights_attested", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const listens = sqliteTable(
  "listens",
  {
    id: text("id").primaryKey(),
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    qualified: integer("qualified", { mode: "boolean" }).notNull().default(false),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    qualifiedAt: text("qualified_at"),
  },
  (table) => [
    index("idx_listens_track_listener_qualified").on(
      table.trackId,
      table.listenerId,
      table.qualified,
    ),
  ],
);

export const hangers = sqliteTable(
  "hangers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trackId: integer("track_id").notNull(),
    listenerId: text("listener_id").notNull(),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_hangers_track_listener").on(table.trackId, table.listenerId),
  ],
);

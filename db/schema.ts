import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const tips = pgTable("tips", {
  id: text().primaryKey(),
  title: text().notNull(),
  text: text().notNull(),
  area: text().notNull().default(""),
  category: text().notNull().default("other"),
  author: text().notNull().default("A neighbour"),
  votes: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

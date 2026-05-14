import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Example table. Replace with your real schema.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

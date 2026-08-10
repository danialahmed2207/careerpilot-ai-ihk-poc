import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  candidateName: text("candidate_name").notNull(),
  targetRole: text("target_role").notNull(),
  company: text("company").notNull(),
  jobLink: text("job_link"),
  jobText: text("job_text").notNull(),
  resumeText: text("resume_text").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_applications_created_at").on(table.createdAt)]);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  objectKey: text("object_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_documents_application_id").on(table.applicationId),
  uniqueIndex("idx_documents_object_key").on(table.objectKey),
]);

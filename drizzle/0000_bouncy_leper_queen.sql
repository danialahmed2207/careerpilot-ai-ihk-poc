CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_name` text NOT NULL,
	`target_role` text NOT NULL,
	`company` text NOT NULL,
	`job_link` text,
	`job_text` text NOT NULL,
	`resume_text` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_applications_created_at` ON `applications` (`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_documents_application_id` ON `documents` (`application_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_object_key` ON `documents` (`object_key`);
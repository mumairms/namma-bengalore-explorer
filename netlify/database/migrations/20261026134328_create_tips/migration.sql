CREATE TABLE "tips" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"author" text DEFAULT 'A neighbour' NOT NULL,
	"votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DROP TABLE "roles" CASCADE;
DROP TABLE "user_roles" CASCADE;
ALTER TABLE "sessions" ADD COLUMN "impersonated_by" text;
ALTER TABLE "users" ADD COLUMN "role" text;
ALTER TABLE "users" ADD COLUMN "banned" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN "ban_reason" text;
ALTER TABLE "users" ADD COLUMN "ban_expires" timestamp;
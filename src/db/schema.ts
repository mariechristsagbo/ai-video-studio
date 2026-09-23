import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uuid,
  real,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { generationStatuses, shotStatuses } from "../domain/video";
const dates = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
};
export const user = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  ...dates,
});
export const session = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...dates,
});
export const account = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  ...dates,
});
export const verification = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ...dates,
});
export const generationState = pgEnum("generation_state", generationStatuses);
export const shotState = pgEnum("shot_state", shotStatuses);
export const generations = pgTable(
  "generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    topic: text("topic").notNull(),
    status: generationState("status").notNull().default("DRAFT"),
    targetDuration: integer("target_duration").notNull(),
    language: text("language").notNull(),
    platform: text("platform").notNull(),
    aspectRatio: text("aspect_ratio").notNull(),
    contentFormat: text("content_format").notNull(),
    visualStyle: text("visual_style").notNull(),
    customInstructions: text("custom_instructions").notNull().default(""),
    creativeBrief: jsonb("creative_brief"),
    script: text("script").notNull().default(""),
    visualBible: jsonb("visual_bible"),
    timelineDuration: real("timeline_duration"),
    revision: integer("revision").default(1).notNull(),
    burnCaptions: boolean("burn_captions").default(true).notNull(),
    clipAudio: boolean("clip_audio").default(false).notNull(),
    narrationId: uuid("narration_id"),
    musicId: uuid("music_id"),
    finalRenderId: uuid("final_render_id"),
    error: text("error"),
    deletedAt: timestamp("deleted_at"),
    ...dates,
  },
  (t) => [index("generation_owner_created").on(t.userId, t.createdAt)],
);
export const scenes = pgTable("scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => generations.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  narration: text("narration").notNull(),
  ...dates,
});
export const shots = pgTable(
  "shots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    duration: integer("duration").notNull(),
    visualDescription: text("visual_description").notNull(),
    videoPrompt: text("video_prompt").notNull(),
    camera: text("camera").default("").notNull(),
    environment: text("environment").default("").notNull(),
    transition: text("transition").default("cut").notNull(),
    mode: text("mode").default("text").notNull(),
    referenceId: uuid("reference_id"),
    characterId: uuid("character_id"),
    continuityFrom: uuid("continuity_from"),
    status: shotState("status").default("DRAFT").notNull(),
    version: integer("version").default(0).notNull(),
    clipId: uuid("clip_id"),
    thumbnailId: uuid("thumbnail_id"),
    lastError: text("last_error"),
    ...dates,
  },
  (t) => [index("shots_generation").on(t.generationId)],
);
export const characters = pgTable("characters", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  visualPrompt: text("visual_prompt").notNull(),
  referenceId: uuid("reference_id"),
  ...dates,
});
export const generationCharacters = pgTable(
  "generation_characters",
  {
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("generation_character_unique").on(t.generationId, t.characterId)],
);
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id").references(() => generations.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  mime: text("mime").notNull(),
  duration: real("duration"),
  metadata: jsonb("metadata"),
  ...dates,
});
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    shotId: uuid("shot_id").references(() => shots.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    status: text("status").default("QUEUED").notNull(),
    payload: jsonb("payload").notNull().default({}),
    providerId: text("provider_id"),
    attempts: integer("attempts").default(0).notNull(),
    polls: integer("polls").default(0).notNull(),
    runAfter: timestamp("run_after").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    error: text("error"),
    ...dates,
  },
  (t) => [index("jobs_reconcile").on(t.status, t.runAfter)],
);
export const renders = pgTable(
  "renders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").default("QUEUED").notNull(),
    composition: jsonb("composition").notNull(),
    assetId: uuid("asset_id"),
    thumbnailId: uuid("thumbnail_id"),
    error: text("error"),
    ...dates,
  },
  (t) => [uniqueIndex("render_version").on(t.generationId, t.version)],
);

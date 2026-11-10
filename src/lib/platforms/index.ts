import { Platform } from "@prisma/client";
import { instagram } from "./instagram";
import { tiktok } from "./tiktok";
import type { Publisher } from "./types";
import { youtube } from "./youtube";

export const publishers: Record<Platform, Publisher> = {
  INSTAGRAM: instagram,
  YOUTUBE: youtube,
  TIKTOK: tiktok,
};

export type { PublishContext, StepResult } from "./types";

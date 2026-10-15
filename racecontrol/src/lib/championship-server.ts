import "server-only";
import { cache } from "react";
import { database } from "./supabase";
import {
  championshipStandings,
  type ChampionshipSnapshot,
} from "./championship";

export const seasonChampionship = cache(async (season: string) => {
  const db = await database();
  const { data, error } = await db.rpc("rc_championship_snapshot", { season });
  if (error) throw Error(error.message);
  if (!data) throw Error("Season not found or not accessible.");
  return championshipStandings(data as ChampionshipSnapshot);
});

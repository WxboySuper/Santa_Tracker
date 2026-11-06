import { parseTimezones } from "@/lib/timezones";
import { defineActivity } from "./activity";
import { TimezonesActivity } from "./timezones-component";

export const timezonesActivity = defineActivity({ id: "timezones", parse: parseTimezones, Component: TimezonesActivity });

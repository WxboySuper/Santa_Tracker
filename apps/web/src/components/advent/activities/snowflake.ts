import { parseSnowflake } from "@/lib/snowflake";
import { defineActivity } from "./activity";
import { SnowflakeActivity } from "./snowflake-component";

export const snowflakeActivity = defineActivity({ id: "snowflake", parse: parseSnowflake, Component: SnowflakeActivity });

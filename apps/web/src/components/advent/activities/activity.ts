import { createElement, type ComponentType, type ReactNode } from "react";

export interface ActivityDefinition<Config> {
  id: string;
  parse(payload: unknown): Config | null;
  Component: ComponentType<{ config: Config; locale: string }>;
  render(payload: unknown, locale: string, key: string): ReactNode | null;
}

export function defineActivity<Config>(activity: Omit<ActivityDefinition<Config>, "render">): ActivityDefinition<Config> {
  return {
    ...activity,
    render(payload, locale, key) {
      try {
        const config = activity.parse(payload);
        return config === null ? null : createElement(activity.Component, { config, locale, key });
      } catch {
        return null;
      }
    },
  };
}

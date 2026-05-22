/**
 * Mocked tool — would normally call a real weather provider.
 * Surfacing it via a Tool interface so future tools plug into the same shape.
 */
export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  execute(input: I): Promise<O>;
}

export interface WeatherInput {
  city: string;
}
export interface WeatherOutput {
  city: string;
  temperatureC: number;
  condition: string;
}

export const getCurrentWeatherTool: ToolDefinition<WeatherInput, WeatherOutput> = {
  name: 'getCurrentWeather',
  description: 'Returns the current weather for a given city',
  async execute({ city }: WeatherInput): Promise<WeatherOutput> {
    // Deterministic mock: hash the city to a temperature so tests are stable.
    const seed: number = [...city].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const conditions: readonly string[] = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy'];
    return {
      city,
      temperatureC: 10 + (seed % 25),
      condition: conditions[seed % conditions.length]!,
    };
  },
};

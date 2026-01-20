import type { z } from "zod";

type ToolInput = Record<
  string,
  string | number | (string | number)[] | undefined | null
>;

const validateInput = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Validation Failed: ${result.error.message}`);
  }
  return result.data;
};

const buildParams = (inputs: ToolInput) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(inputs)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      params.append(key, value.join(","));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
};

export const toCSV = (results: unknown[]): string => {
  if (!results.length) {
    return "";
  }

  const headers = Object.keys(results[0]);

  const escapeValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "";
    }

    const stringValue = String(value);

    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const headerRow = headers.join(",");
  const rows = results.map((row) =>
    headers.map((header) => escapeValue(row[header])).join(","),
  );

  return [headerRow, ...rows].join("\n");
};

const _fetch = async (
  endpoint: string,
  params: URLSearchParams,
  apiKey: string,
  options: {
    exhaustive?: boolean;
    format?: "json" | "csv";
  },
) => {
  const _params = new URLSearchParams(params); // clone the params for pagination cursor change
  let aggResults: unknown[] = [];

  try {
    while (true) {
      const response = await fetch(`${endpoint}?${_params}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!options?.exhaustive) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                options?.format === "csv"
                  ? toCSV(data.results)
                  : JSON.stringify(data, null, 2),
            },
          ],
        };
      }

      if (Array.isArray(data.results)) {
        aggResults = aggResults.concat(data.results);
      }

      const { cursor, last_page } = data.pagination || {};
      if (!last_page && cursor) {
        _params.set("cursor", cursor);
      } else {
        break;
      }
    }
    return {
      content: [{ type: "text" as const, text: toCSV(aggResults) }],
    };
  } catch (error: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Request Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
};

export const getCallback = <T extends z.ZodTypeAny>(
  schema: T,
  urlTemplate: string,
  apiKey: string,
  options?: {
    exhaustive?: boolean;
    format?: "json" | "csv";
  },
) => {
  return async (input: unknown) => {
    try {
      const validData = validateInput(schema, input) as ToolInput;

      let finalUrl = urlTemplate;
      const queryParams: ToolInput = {};

      for (const [key, value] of Object.entries(validData)) {
        if (value === undefined || value === null) {
          continue;
        }

        const placeholder = `{${key}}`;

        if (finalUrl.includes(placeholder)) {
          // Replace the path value placeholder with the value
          finalUrl = finalUrl.replace(placeholder, String(value));
        } else {
          queryParams[key] = value;
        }
      }

      const params = buildParams(queryParams);

      return _fetch(finalUrl, params, apiKey, options);
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  };
};

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

const _fetch = async (
  endpoint: string,
  params: URLSearchParams,
  apiKey: string,
) => {
  try {
    const response = await fetch(`${endpoint}?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [
          {
            type: "text" as const,
            text: `API Error ${response.status}: ${errorText}`,
          },
        ],
        isError: true,
      };
    }

    const data = await response.json();
    let finalContent = JSON.stringify(data, null, 2);

    if (
      data.pagination &&
      typeof data.pagination.last_page === "boolean" &&
      data.pagination.cursor
    ) {
      if (!data.pagination.last_page) {
        // not on the last page, suggest to call the tool again with the next cursor
        const nextCursor = data.pagination.cursor;
        const count = data.pagination.count;
        finalContent +=
          `\n\n` +
          `--- SYSTEM NOTIFICATION: PARTIAL RESULTS ---\n` +
          `You have retrieved ${count} items, but 'last_page' is FALSE.\n` +
          `There are more results available.\n` +
          `\n` +
          `REQUIRED ACTION:\n` +
          `Call this tool again immediately with the argument:\n` +
          `cursor: "${nextCursor}"\n` +
          `\n` +
          `Do not summarize or stop until you receive a response where 'last_page' is true.`;
      } else {
        // otherwise, indicate that all results have been retrieved
        finalContent +=
          `\n\n` +
          `--- SYSTEM NOTIFICATION: PAGINATION COMPLETE ---\n` +
          `'last_page' is TRUE. You have retrieved all available results.`;
      }
    }
    return {
      content: [{ type: "text" as const, text: finalContent }],
    };
  } catch (error: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Network Error: ${error instanceof Error ? error.message : String(error)}`,
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

      return _fetch(finalUrl, params, apiKey);
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

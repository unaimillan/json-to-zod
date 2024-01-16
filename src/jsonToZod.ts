import { format } from "prettier";
import babelParser from "prettier/parser-babel";

const parse = (obj: any, seen: object[]): string => {
  switch (typeof obj) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "bigint":
      return "z.number().int()";
    case "boolean":
      return "z.boolean()";
    case "object":
      if (obj === null) {
        return "z.null()";
      }
      if (seen.find((_obj) => Object.is(_obj, obj))) {
        throw "Circular objects are not supported";
      }
      seen.push(obj);
      if (Array.isArray(obj)) {
        const options = obj
          .map((obj) => parse(obj, seen))
          .reduce(
            (acc: string[], curr: string) =>
              acc.includes(curr) ? acc : [...acc, curr],
            []
          );
        if (options.length === 1) {
          return `z.array(${options[0]})`;
        } else if (options.length > 1) {
          return `z.array(z.union([${options}]))`;
        } else {
          return `z.array(z.unknown())`;
        }
      }
      return `z.object({${Object.entries(obj).map(
        ([k, v]) => `'${k}':${parse(v, seen)}`
      )}})`;
    case "undefined":
      return "z.undefined()";
    case "function":
      return "z.function()";
    case "symbol":
    default:
      return "z.unknown()";
  }
};

export const formatSchema = (schema: string): string => {
  return format(schema, {
    parser: "babel",
    plugins: [babelParser],
  });
}

export const jsonToZod = (
  obj: any,
  name: string = "schema",
  module?: boolean
): string => {
  const parsed = parse(obj, []);

  return module
    ? formatSchema(`import {z} from "zod"\n\nexport const ${name}=${parsed}`)
    : formatSchema(`const ${name}=${parsed}`);
};

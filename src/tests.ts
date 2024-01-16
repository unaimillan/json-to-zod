import z from "zod"
import { Command } from 'commander';
import { read, readFileSync, writeFileSync } from "fs";
import { formatSchema } from "./jsonToZod";

const program = new Command();

program
    .description('Convert JSON to Zod')
    .option('-i, --input <input>', 'Input JSON file')
    .option('-o, --output <output>', 'Output Zod (.ts) file')
    .argument('[json...]', 'JSON input')

program.parse(process.argv);

const options = program.opts();
const args = options.input ? readFileSync(options.input, 'utf8') : program.args.join(' ');
console.log(options)
console.log(args)

abstract class ZValue {
    abstract normalize(): ZValue
    abstract merge(other: ZValue): ZValue
    abstract toZod(): string
}

class ZBoolean extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        if (other instanceof ZBoolean) {
            return this
        }
        return new ZUnion([this, other])
    }
    toZod(): string {
        return `z.boolean()`
    }
}

class ZNumber extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        if (other instanceof ZNumber) {
            return this
        }
        return new ZUnion([this, other])
    }
    toZod(): string {
        return `z.number()`
    }
}

// Up to 20 literal values
class ZLiteralString { }

class ZString extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        if (other instanceof ZString) {
            return this
        }
        return new ZUnion([this, other])
    }
    toZod(): string {
        return `z.string()`
    }
}

class ZNull extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        if (other instanceof ZNull) {
            return this
        }
        return new ZUnion([this, other])
    }
    toZod(): string {
        return `z.null()`
    }
}

class ZUndefined extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        if (other instanceof ZUndefined) {
            return this
        }
        return new ZUnion([this, other])
    }
    toZod(): string {
        return `z.undefined()`
    }
}

const ZOptional = (value: ZValue): ZValue => new ZUnion([value, new ZUndefined()])

class ZUnknown extends ZValue {
    normalize(): ZValue {
        return this
    }
    merge(other: ZValue): ZValue {
        return other
    }
    toZod(): string {
        return `z.unknown()`
    }
}

class ZUnion extends ZValue {
    data: ZValue[];

    constructor(data: ZValue[]) {
        super()
        this.data = data
    }

    normalize(): ZValue {
        if (this.data.length === 1) {
            return this.data[0].normalize()
        }
        return new ZUnion([
            // TODO: check if this is correct
            this.data.reduce((acc, curr) => acc.merge(curr), new ZUnknown())
        ])
    }

    merge(other: ZValue): ZValue {
        // if (other instanceof ZUnion) {
        //     return new ZUnion([...this.data, ...other.data]).normalize()
        // }
        return new ZUnion([...this.data, other])
    }

    toZod(): string {
        return `z.union(${this.data.map(x => x.toZod())})`
    }
}

class ZArray extends ZValue {
    data: ZValue[];
    constructor(data: ZValue[]) {
        super()
        this.data = data
    }

    normalize(): ZValue {
        return new ZArray([
            this.data.reduce((acc, curr) => acc.merge(curr), new ZUnknown())
        ])
    }

    merge(other: ZValue): ZValue {
        if (other instanceof ZArray) {
            return new ZArray([...this.data, ...other.data])
        }
        return new ZUnknown()
    }
    toZod(): string {
        return `z.array(${this.data.map(x => x.toZod())})`
    }
}

class ZObject extends ZValue {
    data: Record<string, ZValue>;

    constructor(data: Record<string, ZValue>) {
        super()
        this.data = data
    }

    normalize(): ZValue {
        return new ZObject(Object.fromEntries(
            Object.entries(this.data).map(([k, v]) => [k, v.normalize()])
        ))
    }

    merge(other: ZValue): ZValue {
        if (other instanceof ZObject) {
            const myMap = new Map(Object.entries(this.data))
            const otherMap = new Map(Object.entries(other.data))
            const resultMap = new Map<string, ZValue>()

            for (const [key, value] of myMap) {
                const otherValue = otherMap.get(key)
                if (otherValue) {
                    resultMap.set(key, value.merge(otherValue))
                } else {
                    resultMap.set(key, ZOptional(value))
                }
            }
            return new ZObject(Object.fromEntries(resultMap.entries()))
        }
        return new ZUnion([this, other])
    }

    toZod(): string {
        return `z.object({${Object.entries(this.data).map(
            ([k, v]) => `'${k}':${v.toZod()}`
        )}})`;
    }
}

const myObj = new ZArray([
    new ZObject({
        a: new ZString(),
        b: new ZString(),
    }),
    new ZObject({
        a: new ZString(),
    }),
    new ZObject({
        a: new ZString(),
        c: new ZString(),
    }),
]).normalize()

// console.dir(myObj, { depth: null })
// process.exit(0)

const jsonToZValue = (obj: any): ZValue => {
    switch (typeof obj) {
        case "string":
            return new ZString();
        case "number":
            return new ZNumber();
        case "boolean":
            return new ZBoolean();
        case "object":
            if (obj === null) {
              return new ZNull();
            }
            if (Array.isArray(obj)) {
                return new ZArray(obj.map(x => jsonToZValue(x)))
            }
            return new ZObject(Object.fromEntries(Object.entries(obj).map(([k, v]: [string, any]) => [k, jsonToZValue(v)])))
        case "undefined":
            return new ZUnknown();
        default:
            return new ZUnknown();
    }
};

const parseString = (str: string): ZValue => {
    return jsonToZValue(JSON.parse(str))
}

// const rawInput = `[${process.argv.slice(2)}]`
const input = JSON.parse(args)

console.log(args)
console.log(input)
console.log("Parsed", jsonToZValue(input).toZod())
console.log("Normalized", jsonToZValue(input).normalize().toZod())

if (options.output){
    writeFileSync(options.output, formatSchema(jsonToZValue(input).normalize().normalize().toZod()), 'utf8')
}

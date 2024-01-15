import z from "zod"

abstract class ZValue {
    abstract normalize(): ZValue
    abstract merge(other: ZValue): ZValue
    abstract toZod(): string
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
    data: {
        [key: string]: ZString
    };

    constructor(data: { [key: string]: ZString }) {
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
                    resultMap.set(key, value)
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

const parseJson = (obj: any): ZValue => {
    switch (typeof obj) {
        case "string":
            return new ZString();
        case "number":
            return new ZNumber();
        case "object":
            if (Array.isArray(obj)) {
                const data = obj.map(x => parseJson(x))
                return new ZArray(data)
            }
        // const data = Object.entries(obj).map(([k, v]) => ({k:parseJson(v)})).reduce<ZObject>((acc, curr) => ({...acc, ...curr}), {})
        // return new ZObject(data)
        // return `z.object({${Object.entries(obj).map(
        //   ([k, v]) => `'${k}':${parse(v, seen)}`
        // )}})`;
        //   case "undefined":
        //     return "z.undefined()";
        //   case "function":
        //     return "z.function()";
        //   case "symbol":
        default:
            return new ZUnknown();
    }
};

const parseString = (str: string): ZValue => {
    return parseJson(JSON.parse(str))
}

const rawInput = `[${process.argv.slice(2)}]`
const input = JSON.parse(rawInput)

console.log(rawInput)
console.log(input)
console.log("Parsed", parseJson(input))
console.log("Normalized", parseJson(input).normalize().toZod())

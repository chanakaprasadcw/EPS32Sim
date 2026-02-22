/**
 * ArduinoParser — Parses and interprets Arduino-style C++ code
 * Converts a subset of Arduino C++ into executable simulation commands
 */
export class ArduinoParser {
    constructor(pinManager, serialCallback) {
        this.pinManager = pinManager;
        this.serialCallback = serialCallback;
        this.variables = {};
        this.functions = {};
        this.setupCode = [];
        this.loopCode = [];
        this.running = false;
        this.startTime = 0;
        this.speed = 1;
    }

    /**
     * Parse Arduino code into setup and loop blocks
     */
    parse(code) {
        this.variables = {};
        this.functions = {};
        this.setupCode = [];
        this.loopCode = [];

        // Remove comments
        code = code.replace(/\/\/.*$/gm, '');
        code = code.replace(/\/\*[\s\S]*?\*\//g, '');

        // Extract global variables
        this.extractGlobals(code);

        // Extract setup()
        const setupMatch = code.match(/void\s+setup\s*\(\s*\)\s*\{/);
        if (setupMatch) {
            const setupBody = this.extractBlock(code, setupMatch.index + setupMatch[0].length - 1);
            this.setupCode = this.tokenize(setupBody);
        }

        // Extract loop()
        const loopMatch = code.match(/void\s+loop\s*\(\s*\)\s*\{/);
        if (loopMatch) {
            const loopBody = this.extractBlock(code, loopMatch.index + loopMatch[0].length - 1);
            this.loopCode = this.tokenize(loopBody);
        }

        // Extract custom functions
        const funcRegex = /(?:void|int|float|double|bool|String|long|unsigned)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
        let funcMatch;
        while ((funcMatch = funcRegex.exec(code)) !== null) {
            const name = funcMatch[1];
            if (name !== 'setup' && name !== 'loop') {
                const body = this.extractBlock(code, funcMatch.index + funcMatch[0].length - 1);
                this.functions[name] = {
                    params: funcMatch[2].split(',').map(p => p.trim().split(/\s+/).pop()).filter(Boolean),
                    body: this.tokenize(body),
                };
            }
        }
    }

    /**
     * Extract global variable declarations
     */
    extractGlobals(code) {
        // Match: int/float/bool/const/String varName = value;
        const lines = code.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip function definitions
            if (trimmed.match(/^(void|int|float|double|bool|String)\s+\w+\s*\(/)) continue;
            if (trimmed.startsWith('#')) {
                // Handle #define
                const defineMatch = trimmed.match(/#define\s+(\w+)\s+(.+)/);
                if (defineMatch) {
                    this.variables[defineMatch[1]] = this.parseValue(defineMatch[2].trim());
                }
                continue;
            }
            // Variable declarations
            const varMatch = trimmed.match(/^(?:const\s+)?(?:int|float|double|bool|long|unsigned\s+long|byte|char|String)\s+(\w+)\s*(?:=\s*(.+))?;/);
            if (varMatch) {
                this.variables[varMatch[1]] = varMatch[2] ? this.parseValue(varMatch[2].trim()) : 0;
            }
        }
    }

    /**
     * Extract a brace-delimited block
     */
    extractBlock(code, startIdx) {
        let depth = 0;
        let start = -1;
        for (let i = startIdx; i < code.length; i++) {
            if (code[i] === '{') {
                if (depth === 0) start = i + 1;
                depth++;
            } else if (code[i] === '}') {
                depth--;
                if (depth === 0) {
                    return code.substring(start, i).trim();
                }
            }
        }
        return '';
    }

    /**
     * Tokenize code block into statements
     */
    tokenize(code) {
        const statements = [];
        const lines = code.split('\n');

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line === '{' || line === '}') continue;

            // Handle multi-line statements (if/for/while blocks)
            if (line.match(/^(if|else if|else|for|while)\b/)) {
                // Find the block
                let block = line;
                if (!line.includes('{')) {
                    // Single-line if/for/while
                    if (i + 1 < lines.length) {
                        block += '\n' + lines[++i].trim();
                    }
                } else {
                    let braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
                    while (braceCount > 0 && i + 1 < lines.length) {
                        i++;
                        block += '\n' + lines[i].trim();
                        braceCount += (lines[i].match(/\{/g) || []).length;
                        braceCount -= (lines[i].match(/\}/g) || []).length;
                    }
                }
                statements.push(block);
            } else {
                // Remove trailing semicolons for processing
                if (line.endsWith(';')) line = line.slice(0, -1).trim();
                if (line) statements.push(line);
            }
        }
        return statements;
    }

    /**
     * Execute a list of statements. Returns a Promise.
     */
    async execute(statements, localVars = {}) {
        for (let i = 0; i < statements.length; i++) {
            if (!this.running) return;
            const stmt = statements[i];
            await this.executeStatement(stmt, localVars);
        }
    }

    /**
     * Execute a single statement
     */
    async executeStatement(stmt, localVars = {}) {
        if (!this.running) return;

        // --- delay ---
        const delayMatch = stmt.match(/^delay\s*\(\s*(.+)\s*\)/);
        if (delayMatch) {
            const ms = this.evaluateExpr(delayMatch[1], localVars);
            await this.sleep(ms / this.speed);
            return;
        }

        // --- delayMicroseconds ---
        const delayUsMatch = stmt.match(/^delayMicroseconds\s*\(\s*(.+)\s*\)/);
        if (delayUsMatch) {
            const us = this.evaluateExpr(delayUsMatch[1], localVars);
            await this.sleep(Math.max(1, us / 1000 / this.speed));
            return;
        }

        // --- Serial.begin ---
        if (stmt.match(/^Serial\.begin\s*\(/)) {
            this.serialCallback('[System] Serial initialized', 'system');
            return;
        }

        // --- Serial.print / println ---
        const printMatch = stmt.match(/^Serial\.(print|println)\s*\(\s*(.*)\s*\)/);
        if (printMatch) {
            const isPrintln = printMatch[1] === 'println';
            const arg = printMatch[2].trim();
            let output = '';

            if (arg === '') {
                output = '';
            } else if (arg.startsWith('"') && arg.endsWith('"')) {
                output = arg.slice(1, -1);
            } else if (arg.startsWith("'") && arg.endsWith("'")) {
                output = arg.slice(1, -1);
            } else {
                // Could be a variable or expression
                const val = this.evaluateExpr(arg, localVars);
                output = String(val);
            }

            // Handle escape sequences
            output = output.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            this.serialCallback(output + (isPrintln ? '' : ''), isPrintln ? 'println' : 'print');
            return;
        }

        // --- Serial.printf ---
        const printfMatch = stmt.match(/^Serial\.printf\s*\(\s*"(.+?)"\s*(?:,\s*(.*))?\s*\)/);
        if (printfMatch) {
            let fmt = printfMatch[1];
            const args = printfMatch[2] ? this.splitArgs(printfMatch[2]).map(a => this.evaluateExpr(a, localVars)) : [];
            let argIdx = 0;
            fmt = fmt.replace(/%(?:\.(\d+))?([dfsuclx%])/g, (match, precision, type) => {
                if (type === '%') return '%';
                const val = args[argIdx++];
                if (type === 'f' && precision !== undefined) {
                    return Number(val).toFixed(parseInt(precision));
                }
                if (type === 'd' || type === 'u') return Math.floor(Number(val));
                return String(val);
            });
            fmt = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/°/g, '°');
            this.serialCallback(fmt, 'printf');
            return;
        }

        // --- pinMode ---
        const pinModeMatch = stmt.match(/^pinMode\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (pinModeMatch) {
            const pin = this.evaluateExpr(pinModeMatch[1], localVars);
            const mode = pinModeMatch[2].trim();
            this.pinManager.pinMode(pin, mode);
            return;
        }

        // --- digitalWrite ---
        const dwMatch = stmt.match(/^digitalWrite\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (dwMatch) {
            const pin = this.evaluateExpr(dwMatch[1], localVars);
            const raw = dwMatch[2].trim();
            const value = raw === 'HIGH' ? 1 : raw === 'LOW' ? 0 : this.evaluateExpr(raw, localVars);
            this.pinManager.digitalWrite(pin, value);
            return;
        }

        // --- analogWrite ---
        const awMatch = stmt.match(/^analogWrite\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (awMatch) {
            const pin = this.evaluateExpr(awMatch[1], localVars);
            const value = this.evaluateExpr(awMatch[2], localVars);
            this.pinManager.analogWrite(pin, value);
            return;
        }

        // --- ledcWrite (ESP32 specific) ---
        const ledcMatch = stmt.match(/^ledcWrite\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (ledcMatch) {
            const channel = this.evaluateExpr(ledcMatch[1], localVars);
            const duty = this.evaluateExpr(ledcMatch[2], localVars);
            // Map channel to pin (simplified)
            this.pinManager.analogWrite(channel, duty);
            return;
        }

        // --- tone ---
        const toneMatch = stmt.match(/^tone\s*\(\s*(.+?)\s*,\s*(.+?)(?:\s*,\s*(.+?))?\s*\)/);
        if (toneMatch) {
            const pin = this.evaluateExpr(toneMatch[1], localVars);
            const freq = this.evaluateExpr(toneMatch[2], localVars);
            this.pinManager.analogWrite(pin, 128); // Simulate with PWM
            return;
        }

        // --- noTone ---
        const noToneMatch = stmt.match(/^noTone\s*\(\s*(.+?)\s*\)/);
        if (noToneMatch) {
            const pin = this.evaluateExpr(noToneMatch[1], localVars);
            this.pinManager.analogWrite(pin, 0);
            return;
        }

        // --- Variable assignment ---
        const assignMatch = stmt.match(/^(?:(?:int|float|double|bool|long|unsigned\s+long|byte|char|String)\s+)?(\w+)\s*([\+\-\*\/]?=)\s*(.+)/);
        if (assignMatch) {
            const name = assignMatch[1];
            const op = assignMatch[2];
            const expr = assignMatch[3].trim();
            const value = this.evaluateExpr(expr, localVars);

            const target = (name in localVars) ? localVars : this.variables;
            switch (op) {
                case '=': target[name] = value; break;
                case '+=': target[name] = (target[name] || 0) + value; break;
                case '-=': target[name] = (target[name] || 0) - value; break;
                case '*=': target[name] = (target[name] || 0) * value; break;
                case '/=': target[name] = (target[name] || 0) / value; break;
            }
            return;
        }

        // --- Increment/decrement ---
        const incMatch = stmt.match(/^(\w+)\s*(\+\+|--)$/);
        if (incMatch) {
            const name = incMatch[1];
            const target = (name in localVars) ? localVars : this.variables;
            if (incMatch[2] === '++') target[name] = (target[name] || 0) + 1;
            else target[name] = (target[name] || 0) - 1;
            return;
        }

        // --- if / else if / else ---
        if (stmt.startsWith('if') || stmt.startsWith('else if') || stmt.startsWith('else')) {
            await this.executeIfElse(stmt, localVars);
            return;
        }

        // --- for loop ---
        const forMatch = stmt.match(/^for\s*\(\s*(.+?)\s*;\s*(.+?)\s*;\s*(.+?)\s*\)\s*\{([\s\S]*)\}/);
        if (forMatch) {
            await this.executeStatement(forMatch[1].replace(/;$/, ''), localVars);
            while (this.running && this.evaluateCondition(forMatch[2], localVars)) {
                const body = this.tokenize(forMatch[4]);
                await this.execute(body, localVars);
                await this.executeStatement(forMatch[3], localVars);
                await this.sleep(1); // Prevent freezing
            }
            return;
        }

        // --- while loop ---
        const whileMatch = stmt.match(/^while\s*\(\s*(.+?)\s*\)\s*\{([\s\S]*)\}/);
        if (whileMatch) {
            let iterations = 0;
            while (this.running && this.evaluateCondition(whileMatch[1], localVars)) {
                const body = this.tokenize(whileMatch[2]);
                await this.execute(body, localVars);
                iterations++;
                if (iterations % 100 === 0) await this.sleep(1);
            }
            return;
        }

        // --- Function call ---
        const funcCallMatch = stmt.match(/^(\w+)\s*\(\s*(.*?)\s*\)/);
        if (funcCallMatch && this.functions[funcCallMatch[1]]) {
            const func = this.functions[funcCallMatch[1]];
            const args = funcCallMatch[2] ? this.splitArgs(funcCallMatch[2]) : [];
            const funcLocals = {};
            func.params.forEach((p, i) => {
                funcLocals[p] = args[i] ? this.evaluateExpr(args[i], localVars) : 0;
            });
            await this.execute(func.body, { ...localVars, ...funcLocals });
            return;
        }
    }

    /**
     * Execute if/else if/else chain
     */
    async executeIfElse(stmt, localVars) {
        const lines = stmt.split('\n');
        let fullStmt = stmt;

        // Parse if condition
        const ifMatch = fullStmt.match(/^(?:else\s+)?if\s*\(\s*(.+?)\s*\)\s*\{([\s\S]*?)\}([\s\S]*)/);
        if (ifMatch) {
            const condition = ifMatch[1];
            const body = ifMatch[2];
            const rest = ifMatch[3].trim();

            if (this.evaluateCondition(condition, localVars)) {
                await this.execute(this.tokenize(body), localVars);
            } else if (rest.startsWith('else if') || rest.startsWith('else')) {
                await this.executeIfElse(rest, localVars);
            }
            return;
        }

        // Simple else block
        const elseMatch = fullStmt.match(/^else\s*\{([\s\S]*)\}/);
        if (elseMatch) {
            await this.execute(this.tokenize(elseMatch[1]), localVars);
        }
    }

    /**
     * Evaluate a condition expression
     */
    evaluateCondition(expr, localVars = {}) {
        expr = expr.trim();

        // Handle && and ||
        if (expr.includes('&&')) {
            const parts = expr.split('&&');
            return parts.every(p => this.evaluateCondition(p.trim(), localVars));
        }
        if (expr.includes('||')) {
            const parts = expr.split('||');
            return parts.some(p => this.evaluateCondition(p.trim(), localVars));
        }

        // Handle negation
        if (expr.startsWith('!')) {
            return !this.evaluateCondition(expr.slice(1).trim(), localVars);
        }

        // Comparison operators
        for (const op of ['>=', '<=', '!=', '==', '>', '<']) {
            const idx = expr.indexOf(op);
            if (idx !== -1) {
                const left = this.evaluateExpr(expr.substring(0, idx).trim(), localVars);
                const right = this.evaluateExpr(expr.substring(idx + op.length).trim(), localVars);
                switch (op) {
                    case '==': return left == right;
                    case '!=': return left != right;
                    case '>': return left > right;
                    case '<': return left < right;
                    case '>=': return left >= right;
                    case '<=': return left <= right;
                }
            }
        }

        // Truthy check
        return !!this.evaluateExpr(expr, localVars);
    }

    /**
     * Evaluate an expression and return its value
     */
    evaluateExpr(expr, localVars = {}) {
        if (typeof expr === 'number') return expr;
        expr = String(expr).trim();

        // Constants
        if (expr === 'HIGH') return 1;
        if (expr === 'LOW') return 0;
        if (expr === 'true') return 1;
        if (expr === 'false') return 0;
        if (expr === 'INPUT') return 'INPUT';
        if (expr === 'OUTPUT') return 'OUTPUT';
        if (expr === 'INPUT_PULLUP') return 'INPUT_PULLUP';

        // Numeric literal
        if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
        if (/^0x[0-9a-fA-F]+$/.test(expr)) return parseInt(expr, 16);

        // String literal
        if ((expr.startsWith('"') && expr.endsWith('"')) ||
            (expr.startsWith("'") && expr.endsWith("'"))) {
            return expr.slice(1, -1);
        }

        // millis()
        if (expr === 'millis()') {
            return Math.floor((Date.now() - this.startTime) * this.speed);
        }

        // micros()
        if (expr === 'micros()') {
            return Math.floor((Date.now() - this.startTime) * this.speed * 1000);
        }

        // digitalRead
        const drMatch = expr.match(/^digitalRead\s*\(\s*(.+?)\s*\)/);
        if (drMatch) {
            const pin = this.evaluateExpr(drMatch[1], localVars);
            return this.pinManager.digitalRead(pin);
        }

        // analogRead
        const arMatch = expr.match(/^analogRead\s*\(\s*(.+?)\s*\)/);
        if (arMatch) {
            const pin = this.evaluateExpr(arMatch[1], localVars);
            return this.pinManager.analogRead(pin);
        }

        // map()
        const mapMatch = expr.match(/^map\s*\(\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (mapMatch) {
            const val = this.evaluateExpr(mapMatch[1], localVars);
            const inMin = this.evaluateExpr(mapMatch[2], localVars);
            const inMax = this.evaluateExpr(mapMatch[3], localVars);
            const outMin = this.evaluateExpr(mapMatch[4], localVars);
            const outMax = this.evaluateExpr(mapMatch[5], localVars);
            return Math.round((val - inMin) * (outMax - outMin) / (inMax - inMin) + outMin);
        }

        // constrain()
        const constrainMatch = expr.match(/^constrain\s*\(\s*(.+?)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (constrainMatch) {
            const val = this.evaluateExpr(constrainMatch[1], localVars);
            const lo = this.evaluateExpr(constrainMatch[2], localVars);
            const hi = this.evaluateExpr(constrainMatch[3], localVars);
            return Math.max(lo, Math.min(hi, val));
        }

        // random()
        const randMatch = expr.match(/^random\s*\(\s*(?:(.+?)\s*,\s*)?(.+?)\s*\)/);
        if (randMatch) {
            const min = randMatch[1] ? this.evaluateExpr(randMatch[1], localVars) : 0;
            const max = this.evaluateExpr(randMatch[2], localVars);
            return Math.floor(Math.random() * (max - min)) + min;
        }

        // abs, min, max, sqrt, pow
        const mathFuncs = { abs: Math.abs, sqrt: Math.sqrt };
        for (const [name, fn] of Object.entries(mathFuncs)) {
            const m = expr.match(new RegExp(`^${name}\\s*\\(\\s*(.+?)\\s*\\)`));
            if (m) return fn(this.evaluateExpr(m[1], localVars));
        }

        const minMaxMatch = expr.match(/^(min|max)\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (minMaxMatch) {
            const a = this.evaluateExpr(minMaxMatch[2], localVars);
            const b = this.evaluateExpr(minMaxMatch[3], localVars);
            return minMaxMatch[1] === 'min' ? Math.min(a, b) : Math.max(a, b);
        }

        const powMatch = expr.match(/^pow\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)/);
        if (powMatch) {
            return Math.pow(this.evaluateExpr(powMatch[1], localVars), this.evaluateExpr(powMatch[2], localVars));
        }

        // isnan
        const isnanMatch = expr.match(/^isnan\s*\(\s*(.+?)\s*\)/);
        if (isnanMatch) {
            return isNaN(this.evaluateExpr(isnanMatch[1], localVars)) ? 1 : 0;
        }

        // Variable lookup
        if (expr in localVars) return localVars[expr];
        if (expr in this.variables) return this.variables[expr];

        // Simple arithmetic: try to evaluate via splitting operators
        // Handle + - * / %
        try {
            // Replace variables in expression
            let evalExpr = expr;
            // Replace variable names with values (longest first to avoid partial replacements)
            const allVars = { ...this.variables, ...localVars };
            const sortedNames = Object.keys(allVars).sort((a, b) => b.length - a.length);
            for (const name of sortedNames) {
                const val = allVars[name];
                if (typeof val === 'number') {
                    evalExpr = evalExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(val));
                }
            }
            // Replace constants
            evalExpr = evalExpr.replace(/\bHIGH\b/g, '1').replace(/\bLOW\b/g, '0');
            evalExpr = evalExpr.replace(/\btrue\b/g, '1').replace(/\bfalse\b/g, '0');

            // Safe eval for math
            if (/^[\d\s\+\-\*\/\%\.\(\)]+$/.test(evalExpr)) {
                return Function(`"use strict"; return (${evalExpr})`)();
            }
        } catch (e) {
            // ignore
        }

        return 0;
    }

    /**
     * Split comma-separated arguments respecting parentheses
     */
    splitArgs(argsStr) {
        const args = [];
        let depth = 0;
        let current = '';
        for (const ch of argsStr) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === ',' && depth === 0) {
                args.push(current.trim());
                current = '';
                continue;
            }
            current += ch;
        }
        if (current.trim()) args.push(current.trim());
        return args;
    }

    /**
     * Parse a value from string
     */
    parseValue(str) {
        str = str.trim();
        // Remove trailing semicolons
        if (str.endsWith(';')) str = str.slice(0, -1).trim();

        if (str === 'true' || str === 'HIGH') return 1;
        if (str === 'false' || str === 'LOW') return 0;
        if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
        if (/^0x[0-9a-fA-F]+$/.test(str)) return parseInt(str, 16);
        if ((str.startsWith('"') && str.endsWith('"'))) return str.slice(1, -1);

        // It might reference another variable
        if (str in this.variables) return this.variables[str];
        return 0;
    }

    /**
     * Async sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(1, ms)));
    }

    setSpeed(speed) {
        this.speed = speed;
    }
}

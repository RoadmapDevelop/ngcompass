import pc from "picocolors";
import {
    type HealthReport,
    type InitResult,
    type ConfigIssue,
    PACKAGE_VERSION,
    type ConfigReport,
} from "@ngcompass/common";
import type { ConfigReporter } from "../types.js";

type ExtendedConfigReporter = ConfigReporter & {
    renderInitResult?: (result: InitResult) => void;
    renderHealthReport?: (report: HealthReport) => void;
};

const formatPath = (path?: (string | number)[]): string => {
    if (!path || path.length === 0) return "";
    return path
        .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
        .join(".")
        .replace(/\.\[/g, "[");
};

const formatIssue = (issue: ConfigIssue): string => {
    const label = issue.severity === "error" ? pc.red("error") : pc.yellow("warn");
    const path = formatPath(issue.path);
    const pathInfo = path ? ` ${pc.gray(`at ${path}`)}` : "";
    const codeInfo = issue.code ? ` ${pc.dim(issue.code)}` : "";

    let output = `${label} ${issue.message}${pathInfo}${codeInfo}`;

    if (issue.suggestion) {
        output += `\n          ${pc.cyan("→")} ${pc.dim(issue.suggestion)}`;
    }

    return output;
};

const renderHeader = () => {
    console.log(`${pc.bold("ngcompass")} ${pc.gray(PACKAGE_VERSION)}`);
};

const renderIssues = (report: HealthReport) => {
    if (!report.issues || report.issues.length === 0) return;

    // Group issues by file
    const issuesByFile = new Map<string, ConfigIssue[]>();
    for (const issue of report.issues) {
        const file = issue.file || "unknown";
        const list = issuesByFile.get(file) || [];
        list.push(issue);
        issuesByFile.set(file, list);
    }

    console.log("");

    for (const [file, issues] of issuesByFile) {
        if (file !== "unknown") console.log(pc.underline(file));

        for (const issue of issues) {
            const loc = issue.line ? `${issue.line}:${issue.column || 1}` : "";
            const locLabel = loc ? pc.gray(loc.padEnd(8)) : "";
            console.log(`  ${locLabel}  ${formatIssue(issue)}`);
        }

        console.log("");
    }
};

const renderSummary = (report: HealthReport) => {
    const errors = report.issues.filter((i) => i.severity === "error");
    const warnings = report.issues.filter((i) => i.severity === "warning");

    if (errors.length === 0 && warnings.length === 0) {
        console.log(`${pc.green("No issues found.")} ${pc.bold("status")} ${pc.green("OK")}`);
        return;
    }

    const parts: string[] = [];
    if (errors.length) parts.push(pc.red(`${errors.length} ${errors.length === 1 ? "error" : "errors"}`));
    if (warnings.length) parts.push(pc.yellow(`${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`));

    const statusLabel = errors.length > 0 ? pc.red("ERROR") : pc.yellow("WARN");
    const total = errors.length + warnings.length;

    console.log(`Found ${total} issues (${parts.join(", ")}) status ${statusLabel}`);
};

export const TextConfigReporter: ExtendedConfigReporter = {
    report(report: ConfigReport): void {
        if (!report.valid) {
            console.error(pc.red("✗ Configuration validation failed"));
            for (const issue of report.issues) {
                const pathString = issue.path?.join(".") || "root";
                console.error(`  [${issue.severity.toUpperCase()}] ${pathString}: ${issue.message}`);
            }
            return;
        }

        // If you later want a “valid config” message, add it here.
    },

    renderInitResult(result: InitResult) {
        if (result.success) {
            console.log(`${pc.green("✔")} ${result.filePath}`);
            return;
        }

        if (result.alreadyExists) {
            console.log(`${pc.yellow("◆")} ${result.filePath} ${pc.gray("(exists)")}`);
            return;
        }

        console.error(`${pc.red("✘")} initialization failed`);
    },

    renderHealthReport(report: HealthReport) {
        renderHeader();
        renderIssues(report);
        renderSummary(report);
    },
};

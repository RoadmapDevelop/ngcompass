import type { HealthReport, InitResult } from '@ngcompass/common';

export interface ConfigReporter {
    renderHealthReport(report: HealthReport): void | Promise<void>;
    renderInitResult(result: InitResult): void | Promise<void>;
}

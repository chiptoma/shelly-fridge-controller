export interface ValidationError {
  field: string;
  message: string;
  level?: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  level?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

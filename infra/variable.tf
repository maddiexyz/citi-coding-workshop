variable "aws_project" {
  description = "The AWS project name."
  type        = string
  default     = "coding-workshop"
}

variable "aws_bucket" {
  description = "The AWS S3 bucket name for terraform state storage."
  type        = string
  default     = "coding-workshop-us-east-1-abcd1234"
}

variable "aws_app_code" {
  description = "The AWS application unique code."
  type        = string
  default     = "abcd1234"
}

variable "aws_ds_ip" {
  description = "The AWS Directory Service ip address."
  type        = string
  default     = ""
}

variable "aws_vpc_id" {
  description = "The AWS VPC identifier."
  type        = string
  default     = null
}

variable "aws_postgres_enabled" {
  description = "Enable or disable PostgreSQL (AWS Aurora). Default: true (set to 'false' to disable it)."
  type        = bool
  default     = true

  validation {
    condition     = contains([true, false], var.aws_postgres_enabled)
    error_message = "The aws_postgres_enabled variable must be either 'true' or 'false'."
  }
}

variable "aws_postgres_host" {
  description = "PostgreSQL host for LocalStack. Default: 'host.docker.internal' (set to '172.17.0.1' on Linux)."
  type        = string
  default     = null
}

variable "aws_mongo_enabled" {
  description = "Enable or disable MongoDB (AWS DocumentDB). Default: false (set to 'true' to enable it)."
  type        = bool
  default     = false

  validation {
    condition     = contains([true, false], var.aws_mongo_enabled)
    error_message = "The aws_mongo_enabled variable must be either 'true' or 'false'."
  }
}

variable "aws_mongo_host" {
  description = "MongoDB host for LocalStack. Default: 'host.docker.internal' (set to '172.17.0.1' on Linux)."
  type        = string
  default     = null
}

variable "aws_eks_enabled" {
  description = "Enable or disable Jupyter Notebook (AWS EKS). Default: false (set to 'true' to enable it)."
  type        = bool
  default     = false

  validation {
    condition     = contains([true, false], var.aws_eks_enabled)
    error_message = "The aws_eks_enabled variable must be either 'true' or 'false'."
  }
}

variable "aws_eks_type" {
  description = "EKS nodes type. Default: SPOT."
  type        = string
  default     = "SPOT"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.aws_eks_type)
    error_message = "The aws_eks_type variable must be either 'ON_DEMAND' or 'SPOT'."
  }
}

variable "app_currency" {
  description = "ISO 4217 currency code used to display budget amounts (display only, no conversion). Default: INR."
  type        = string
  default     = "INR"

  validation {
    condition     = can(regex("^[A-Z]{3}$", var.app_currency))
    error_message = "The app_currency variable must be a three-letter ISO 4217 code such as USD or EUR."
  }
}

variable "ai_enabled" {
  description = "Turn on the AI project briefing (the ai Lambda calls the Gemini API). Default: false."
  type        = bool
  default     = false
}

variable "ai_provider" {
  description = "Model provider for AI project briefings. Only gemini is supported."
  type        = string
  default     = "gemini"

  validation {
    condition     = var.ai_provider == "gemini"
    error_message = "ai_provider must be gemini."
  }
}

variable "ai_model_id" {
  description = "Gemini model used for AI project briefings. Default: gemini-3.5-flash."
  type        = string
  default     = "gemini-3.5-flash"
}

variable "gemini_api_key" {
  description = "Gemini API key for the ai Lambda. bin/deploy-backend.sh reads it from ~/.gemini-key (empty: AI off); never commit it."
  type        = string
  sensitive   = true
}

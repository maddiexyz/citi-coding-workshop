# Private Lambda that applies database migrations inside the VPC, where
# Aurora is reachable (bin/migrate.sh uses psql and only reaches the local
# database). Invoked by bin/migrate-cloud.sh after each deploy.
#
# Unlike the services in lambda.tf it has no Function URL and no CloudFront
# route, so nothing outside AWS can call it. It reuses the provided Lambda
# role, VPC and security group.
module "migrate" {
  source  = "terraform-aws-modules/lambda/aws"
  version = "~> 8.0"

  function_name   = format("%s-migrate-%s", var.aws_project, local.app_id)
  description     = "Applies backend/_db migrations and seeds the admin user"
  package_type    = "Zip"
  architectures   = ["x86_64"]
  handler         = "function.handler"
  runtime         = "python3.13"
  memory_size     = 128
  timeout         = 120
  tracing_mode    = "PassThrough"
  build_in_docker = false
  lambda_role     = local.lambda_role_arn
  store_on_s3     = data.aws_caller_identity.this.id != "000000000000"
  s3_bucket       = data.aws_caller_identity.this.id != "000000000000" ? format("%s-tfstate-%s", var.aws_project, local.app_id) : null
  s3_prefix       = data.aws_caller_identity.this.id != "000000000000" ? format("lambda/%s/migrate/", local.app_id) : null

  # The handler, the shared code as common/, and the SQL files as db/
  source_path = [
    {
      path             = abspath(format("%s/../backend/_migrate", path.module))
      patterns         = ["!__pycache__/.*", "!\\..*"]
      pip_requirements = true
    },
    {
      path          = abspath(format("%s/../backend/_common", path.module))
      prefix_in_zip = "common"
      patterns      = ["!__pycache__/.*", "!\\..*"]
    },
    {
      path          = abspath(format("%s/../backend/_db", path.module))
      prefix_in_zip = "db"
    },
  ]

  vpc_security_group_ids = data.aws_security_groups.this.ids
  vpc_subnet_ids         = local.public_subnet_ids
  attach_network_policy  = true

  create_package                    = true
  create_role                       = false
  ephemeral_storage_size            = 512
  cloudwatch_logs_retention_in_days = 7
  cloudwatch_logs_skip_destroy      = false
  use_existing_cloudwatch_log_group = false
  trigger_on_package_timestamp      = false
  create_lambda_function_url        = false

  # Only the database settings; the services' other variables are not needed
  environment_variables = {
    for key in ["IS_LOCAL", "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_NAME", "POSTGRES_USER", "POSTGRES_PASS"] :
    key => trimspace(local.env_vars[key]) if try(trimspace(local.env_vars[key]), "") != ""
  }

  tags = local.app_tags
}

output "migrate_function_name" {
  description = "Name of the private migrations Lambda (invoked by bin/migrate-cloud.sh)"
  value       = module.migrate.lambda_function_name
}

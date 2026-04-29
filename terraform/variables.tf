variable "do_token" {
  description = "DigitalOcean API token. Set via TF_VAR_do_token or terraform.tfvars (gitignored)."
  type        = string
  sensitive   = true
}

variable "name" {
  description = "Name prefix for the Droplet and related resources."
  type        = string
  default     = "skypulse"
}

variable "region" {
  description = "DigitalOcean region slug (e.g. nyc1, fra1, sfo3)."
  type        = string
  default     = "nyc1"

  validation {
    condition     = contains(["nyc1", "nyc3", "fra1", "sfo3", "ams3", "sgp1", "lon1"], var.region)
    error_message = "The region must be a valid DigitalOcean slug (e.g., nyc1, fra1, sfo3)."
  }
}

variable "size" {
  description = "Droplet size slug. s-1vcpu-1gb is enough for the app + SQLite."
  type        = string
  default     = "s-1vcpu-1gb"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.size))
    error_message = "The size must be a valid DigitalOcean slug (e.g., s-1vcpu-1gb)."
  }
}

variable "image" {
  description = "Base image. Ubuntu 24.04 LTS — Docker is installed by cloud-init."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "ssh_key_fingerprints" {
  description = "Fingerprints of SSH keys (already uploaded to DigitalOcean) authorized to log in."
  type        = list(string)
  default     = []
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to reach SSH (port 22). Tighten this in production."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "tags" {
  description = "Tags applied to the Droplet."
  type        = list(string)
  default     = ["skypulse", "env:prod"]
}

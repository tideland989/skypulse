terraform {
  required_version = ">= 1.14"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.84.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

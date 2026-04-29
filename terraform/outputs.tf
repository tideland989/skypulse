output "droplet_id" {
  description = "DigitalOcean Droplet ID."
  value       = digitalocean_droplet.skypulse.id
}

output "droplet_ipv4" {
  description = "Public IPv4 address of the Droplet."
  value       = digitalocean_droplet.skypulse.ipv4_address
}

output "ssh_command" {
  description = "Convenience SSH command (assumes the matching private key is in your agent)."
  value       = "ssh root@${digitalocean_droplet.skypulse.ipv4_address}"
}

output "service_url" {
  description = "Where the API will be reachable once `docker compose up` is running."
  value       = "http://${digitalocean_droplet.skypulse.ipv4_address}:3000"
}

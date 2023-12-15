# wordpress-site-generator
API for launching new instances of Wordpress sites on multiple subdomains.

This node.js app provides an API that you can call to programmatically
create a new instance of a container-based Wordpress installation that is
available over NGINX on a specific subdomain.

For instance, you want to allow your system to be able to create new 
instances of Wordpress sites on demand:

user-a.example.com

user-b.example.com

And so on.

This was intended as an example for a former client, and is not intended
to be a production-ready piece of code (it is, however, pretty close and 
you could easily tweak it a bit to handle real-world situations).

If you want to test this locally, you will need to have the following:

1. A linux box running NGINX and Docker + Docker Compose.

2. Some changes to your /etc/hosts file:

Although the API takes a subdomain as a parameter, if you don't have
an actual domain with a wildcard DNS configured, you will need to 
manually modify your /etc/hosts to match the subdomain in your test
request; for instance, right now it's "joeuser" and so your hosts 
file will need to look like this:

127.0.0.1  example.com

127.0.0.1  joeuser.example.com

After that, it's just a matter of POSTing to the "/sites" endpoint
with the following JSON request body:

{
  "account_id": "49c60352-b08f-426b-a25d-5e1b24782f68",
  "account_domain": "example.com",
  "account_subdomain": "joeuser",
  "account_email_address": "joeuser@example.com",
  "account_admin_password": "testing"
}

And within a few moments you'll have a new Wordpress instance
running at "joeuser.example.com", the ADMIN user will be the email
address "joeuser@example.com" and the password will be "testing"

I hope you find this useful.



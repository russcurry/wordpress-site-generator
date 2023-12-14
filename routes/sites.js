var express = require('express');
var router = express.Router();
const { Liquid } = require('liquidjs')
const uuid = require('uuid')
const path = require('path')
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fsPromises = require('fs').promises;

/**
 * Creates a new Wordpress installation for the specified
 * user account, and then reconfigured the nginx server to
 * serve that installation at the specified subdomain.
 *
 * Example of what the request body should look like:
 *
 * {
 *   "account_id": "49c60352-b08f-426b-a25d-5e1b24782f68",
 *   "account_domain": "example.com",
 *   "account_subdomain": "joeuser",
 *   "account_email_address": "joeuser@example.com",
 *   "account_admin_password": "testing"
 * }
 *
 * NOTE 1: The password that is supplied is the password that
 * will be used for the admin account on Wordpress.
 *
 * NOTE 2: You will need to adjust your hosts file so that
 * example.com routes to localhost in order to test this code
 * on your local machine.
 */
router.post('/',  async function(req, res, next) {
    // Configure the substitution parameters for the LiquidJS template
    // that we will render to generate the docker-compose.yml file for
    // deploying the new collection of containers for this user's site.
    const configuration = {
      account_id: req.body.account_id,
      account_subdomain: req.body.account_subdomain,
      mysql_site_database: 'wordpress',
      mysql_site_username: 'wordpress_user',
      mysql_site_password: req.body.account_admin_password,
      mysql_root_password: uuid.v4(),
    }

    // Now that we have all the parameters that we need, let's create a
    // folder on the local filesystem that will act as the home directory
    // for the new WordPress install; we want both the MySQL container and
    // the WordPress container to be able to persist data so that their
    // configurations can survive a reboot and so on.
    const sitepath = "/var/www/sites/" + configuration.account_id;
    try {
      await fsPromises.mkdir(sitepath);
    } catch(x) {
        console.log(x);
      res.status(500).json({ message: "Couldn't create installation directory"})
      return;
    }

    // Render the docker-compose.yml file and save it in the root of the
    // user's site directory:
    try {
      const engine = new Liquid({root: path.join(__dirname + '/../templates'), extname: '.liquid'});
      const rendered_template = engine.renderFileSync('docker-template', configuration);
      await fsPromises.writeFile(sitepath + '/docker-compose.yml', rendered_template);
    } catch(x) {
        console.log(x);
      res.status(500).json({ message: "Couldn't create docker-compose file."})
      return;
    }



    // Now let's run docker compose and start all the containers:
    try {

      // The account_id of the user who owns this site is used as the project name
      // for the Docker Compose project. This just makes it easier to find and manage
      // the resources associated with a particular user's account.
      const project_name = configuration.account_id;

      // The user's installation gets it own instance of the docker-compose.yml file:
      const project_file = sitepath + "/docker-compose.yml";

      // And now we just run Docker Compose to startup the containers:
      await exec("docker compose -f " + project_file + " -p " + project_name + " up -d");

      // After Docker Compose has started all the containers, we want to get the
      // specific port that Docker has exposed on the WordPress container:
      const { stdout } = await exec("docker port " + project_name + "-wp");

      // extract the internal port number from the resulting string
      const wordpress_container_expr = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d{1,5})/
      const wordpress_container_port = wordpress_container_expr.exec(stdout)[2];

        // Now we're going to create a new reverse proxy configuration for this
        // installation and add it to the NGINX server's available-sites:
        const virtual_host_configuration = {
            host: req.body.account_domain,
            port: wordpress_container_port,
            subdomain: req.body.account_subdomain
        }

        try {
            const engine = new Liquid({root: path.join(__dirname + '/../templates'), extname: '.liquid'});
            const rendered_virtual_host_entry = engine.renderFileSync('server-template', virtual_host_configuration);
            // Append to the end of the NGINX virtual hosts file:
            const virtual_hosts_file = '/etc/nginx/sites-available/default'
            await fsPromises.appendFile(virtual_hosts_file, rendered_virtual_host_entry, {flag: "as"});
            // Restart NGINX:
            await exec("systemctl restart nginx");
        } catch(x) {
            res.status(500).send(x);
            return;
        }


      // Now we can use the WordPress CLI container to adjust the configuration
      // in the WordPress container:
      let init_wp_command = "docker exec " + req.body.account_id + "-cli wp core install";
      init_wp_command = init_wp_command.concat(" --url=" + req.body.account_subdomain + "." + req.body.account_domain);
      init_wp_command = init_wp_command.concat(" --admin_user=" + req.body.account_email_address);
      init_wp_command = init_wp_command.concat(" --admin_password=" + configuration.mysql_site_password);
      init_wp_command = init_wp_command.concat(" --title='Just Another WordPress Site'");
      init_wp_command = init_wp_command.concat(" --admin_email=" + req.body.account_email_address);

      // NOTE: It takes a second for the WordPress container to finish
      // initializing, so if we try to use the WP CLI container right
      // now it will fail. This is fine for a demo, but you'd need a better
      // mechanism if you were going to do this in production.
      await new Promise(r => setTimeout(r, 10000));

      // Execute the WP CLI command to complete the WordPress installation:
      await exec(init_wp_command);

    } catch(x) {
      res.status(500).send(x);
      return;
    }

    res.status(201).send("Your wordpress site is ready.");

});

module.exports = router;

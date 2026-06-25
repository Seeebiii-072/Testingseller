<?php
define('WP_CACHE', true); // Added by SpeedyCache

/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the website, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'bestamzd_wp91' );

/** Database username */
define( 'DB_USER', 'bestamzd_wp91' );

/** Database password */
define( 'DB_PASSWORD', 'Jwp.76!q3S' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         'h4npcjz5c8t1ehxokyp0s5tbyhdyegcstdyhvebr8ahd6lilqxp47vpa9b8n1gbg' );
define( 'SECURE_AUTH_KEY',  'munwvnokz505edas9jma3gzfc12qzpdcgqbcfqa5ebpmr51ognsb80payr3ropuh' );
define( 'LOGGED_IN_KEY',    'k6kwimutkugdnaqo2fkoqbua9clanngh6xdoddr9oqw8zl2g0icto8xtot32glzz' );
define( 'NONCE_KEY',        'pnj2yquqawthkosem0hwhwfmpkvpnqzcmpgysr25v2rfn7klsjd8gndysrxb5nw8' );
define( 'AUTH_SALT',        'ianeyflvf4qruwab1trdsg7g8cs85cowfz0pjc8gcquilnbsgdmvlkvopsfwwzsy' );
define( 'SECURE_AUTH_SALT', '2te9xmaeypyws5k86dvry7zhhjxcfuynjfpphm9uwbnjcnkwzrye7luian90jspt' );
define( 'LOGGED_IN_SALT',   'bkufyvos2es4hbquxwmfs7baiuba3vzn9kfm4iki49emywf3rsqh9nxfarliblgf' );
define( 'NONCE_SALT',       'lv7wi2ooyvqbtnetkaau76j9fgaimltpmzqf8txufizc9athgz7i0evl9zzrum8j' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 *
 * At the installation time, database tables are created with the specified prefix.
 * Changing this value after WordPress is installed will make your site think
 * it has not been installed.
 *
 * @link https://developer.wordpress.org/advanced-administration/wordpress/wp-config/#table-prefix
 */
$table_prefix = 'wpek_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://developer.wordpress.org/advanced-administration/debug/debug-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';

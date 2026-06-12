# sysstats by feuerswut

A plugin to view your system stats (CPU, RAM, etc. on a handy dashboard, comes with a json API.)

## Install
Easy install via HFS UI:
<img width="1228" height="509" alt="Image" src="https://github.com/user-attachments/assets/923adda4-d8ce-4e92-aa93-ae98c07c3102" />

## Access Dashboard
To access, visit
/~/stats (Default: to access, login is required -> otherwise 404 not found or whatever HFS is serving under that endpoint.) 

Change the public dashboard visibility under plugin options.

## Usage Ping
This plugin contains a daily usage ping, so I know what kind of architectures are used and how I can improve the dashboard. By default, only limited data is sent ("basic" usage ping), you can opt-out completely by setting the usage ping to "off", or give me more information by setting it to "detailed".

# LICENSE
[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) and [Chart.js](https://github.com/chartjs/Chart.js) are licensed under the MIT License.

[systeminformation](https://github.com/sebhildebrandt/systeminformation) is verbatim-copied and also licensed under MIT.

This plugin is licensed under the GNU Affero Public License (AGPLv3).

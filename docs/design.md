# Extracts Map

## Goal

A simple and easy to use web map that shows the bounds of extracts offered by Geofabrik and OSM-France.

## Background

OpenStreetMap offers a [planet file](https://planet.openstreetmap.org/) that contains the full data from the project, along with a set of change files that can be used to keep the planet file up to date, minute by minute.
This planet file is quite large (the pbf version is nearly 90GB), so several organizations also offer extracts of specific regions.
These extracts usually have a hierarchy of size, ranging from continents down to countries,  major regions (e.g. Canadian Provinces and Territories), and sub-regions (e.g. the Greater Golden Horseshoe area in Ontario).

[Geofabrik](https://download.geofabrik.de/) and [OpenStreetMap France](https://download.openstreetmap.fr/) both provide a comprehensive set of extracts for the entire globe, paired with extract-specific change files.
Other services like [Slice OSM](https://slice.openstreetmap.us) and [BBBike](https://data.bbbike.org/osm/region/) also provide extracts, but do not provide corresponding change files.

One key use case for extracts that do have corresponding change files is to populate a database for Overpass, a service that makes OpenStreetMap data queryable.
I have recently been working on a docker compose set-up that would allow a user to use a collection of small extracts and change files to run an Overpass server.
This allows a user to add data coverage to their Overpass server without the significant storage requirements of jumping up to a country or continent–level extract.

It can be challenging for users to determine which extracts cover their areas of interest.
Geofabrik’s download site shows extract boundaries, but only for one extract at a time.
OSM-FR’s download site is just a NGINX file directory and does not display extract boundaries at all.

Seeing all the boundaries at a glance would be useful, since each provider has different sub-region coverage.
For example, Geofabrik is the only provider with sub-region extracts for British Columbia, and OSM-FR is the only provider with sub-region extracts for Quebec.
It may also be possible that there are slight differences in the boundaries that each provider uses for similarly-named extracts, since they each use their own boundary files.

## Technical Implementation

I would like to explore the best technical implementation to meet the goals below:

- The end result should be a static site
- The stack should be simple and run entirely on my resources (i.e. deployable on Coolify that I run on my own VPS).
  I considered a set-up where the site would be run with github pages and updated using github actions, but I would rather run it as something entirely self-contained.
- In development and in production, the code used should be respectful and not bombard both extract providers with requests.
  Downloading a set of example files for development is preferred over constantly querying the providers.
  Requesting headers for files is preferred over requesting a full download just to check if e.g. an extract boundary has been changed.
  Requests should also be rate-limited so that dozens of requests are not being made within the same second.

Non-goals:

- This web map is not intended to be a live indicator of the size, last updated date, or replication status of the files on either provider.
  Updating on a daily or weekly basis is fine, though it would be nice to have an option to run a manual update if needed.
- This web map is not intended to be the final endpoint for users to download files from the providers.
  It should link out to their respective pages instead of providing the direct download links.

I think that one deployment option may be a two-container docker compose deployment on Coolify:

- Container 1 is a simple reverse proxy or web server container to serve the static files
- Container 2 runs some simple scripts to generate updated static files on a daily or weekly basis

However, I am option to other options that meet the goals above.

## Design and Features

Some thoughts on the site design:

- It only needs to be one page that shows a map with the boundaries.
  Any additional info can be provided as a sidebar or modal window; no navigation is needed.
- The page is more likely to serve users on Desktop, but it should be usable and accessible for mobile users as well
- The page should provide prominent links to the homepages of both providers: https://www.openstreetmap.fr/ and https://www.geofabrik.de/
- The page should use Maplibre GL JS (either vanilla or via react-map-gl) for the map.
  I can provider a maptiler API key for the basemap via environment variable.
- If it doesn’t add too much complexity, I would like the site templating to be written in React/TS.
  (I think then it can be built to static with Vite?)
- Suggested controls for the boundaries shown on the map:
  - Size: continent, country, region, sub-region (default: sub-region)
  - A selection control to allow the user to toggle showing either provider’s boundaries or both at the same time (default: both)
  - A way for the user to select one or more boundaries displayed on the map and get a rough estimate of the download size for all those regions combined

Some notes on the updating logic:

- Geofabrik provides a convenient endpoint in GeoJSON format for all of their extracts: https://download.geofabrik.de/index-v1.json
- The same details for OSM-FR will have to be built manually from their https://download.openstreetmap.fr/ page.
  The boundaries provided are in .poly (https://wiki.openstreetmap.org/wiki/Osmosis/Polygon_Filter_File_Format) format and will need to be converted.

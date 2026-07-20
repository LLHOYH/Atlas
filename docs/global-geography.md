# Global Geography Architecture

Atlas separates populated places from administrative areas. A city point and a polygon that covers the surrounding land are not automatically the same entity.

## Runtime hierarchy

- Country view uses Natural Earth country silhouettes.
- Early City zoom uses geoBoundaries ADM1 regions such as states and provinces.
- Mid City zoom uses geoBoundaries ADM2 areas such as counties and districts.
- Deep City zoom requests the deepest available open local layer from ADM3 down to ADM1.
- The United States replaces the deepest generic layer with Census TIGERweb incorporated-place, consolidated-city, and census-place polygons.
- GeoNames supplies populated-place labels worldwide. A place remains a point when no authoritative municipal polygon is available.

Every rendered administrative polygon retains its source level. Region and district selections are labelled as such in the profile card; Atlas does not rename them as cities.

## Sources and licensing

- geoBoundaries `gbOpen`: worldwide ADM0–ADM5 administrative files, normally CC BY 4.0 with source-specific metadata and attribution.
- U.S. Census TIGERweb: authoritative U.S. municipal and census-place geometry.
- GeoNames: worldwide populated places under CC BY 4.0.
- Natural Earth: country geometry and macro labels.

## Overture bulk path

[Overture Maps Divisions](https://docs.overturemaps.org/guides/divisions/) is the preferred future bulk source for normalized `region`, `county`, `localadmin`, and `locality` entities. Its GeoParquet release is too large to query in the browser or bundle unsplit. Production ingestion should:

1. Query the cloud-hosted `division_area` dataset offline.
2. Keep land polygons for `region`, `county`, `localadmin`, and `locality`.
3. Simplify geometry at multiple tolerances while preserving topology.
4. Partition output by country and detail level.
5. Publish the shards through object storage or vector tiles with ODbL attribution.

Overture improves normalization and coverage, but it still cannot make municipal boundaries cover rural land. Continuous coverage must come from region, county, or district layers.

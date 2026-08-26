# GCRB Equipment Hub

Build a production-ready internal application for the المؤسسة العامة للطرق والجسور called:

كاتلوج معدات المؤسسة العامة للطرق والجسور

Internal technical project name:
GCRB Equipment Catalog

Recommended internal slug/repository name:
gcrb-equipment-catalog

The Arabic name must be the primary visible product name in the Arabic interface.

When the English interface is selected, use:
GCRB Equipment Catalog

Do not display temporary names such as HeavyCat Pro anywhere in the final application.

PRODUCT PURPOSE

Build a professional heavy-equipment catalog, spare-parts search, technical-manual management, and online catalog discovery system for the المؤسسة العامة للطرق والجسور.

This is an institutional technical application, not an e-commerce marketplace.

It will eventually be used by engineers, mechanics, workshop staff, equipment departments, maintenance departments and authorized technical users to quickly locate:

Equipment models

Serial numbers

Serial prefixes

Spare-part numbers

Alternative part numbers

Assemblies

Exploded diagrams

Parts catalogs

Service manuals

Workshop manuals

Operation manuals

Hydraulic manuals

Electrical manuals

Engine manuals

Other technical documentation

PRIMARY USER EXPERIENCE

The user must have ONE powerful universal search field.

Examples:

Machine model:
GD511A-1

Serial number:
10001

Part number:
23A-15-00053

Normalized part number:
23A1500053

Description:
TRANSMISSION ASS'Y

Catalog number:
Any known catalog/manual number

The application must:

Search the organization's own catalog database first.

Immediately display matching local results.

Allow an Online Search when local information is unavailable or when the user requests additional results.

Query approved external catalog sources through modular connectors.

Display online results separately as temporary results.

Never automatically save online results.

Allow authorized users to review and import permitted results.

Save imported information into the organization's database.

Make imported information available in future local searches.

Prepare architecture for a future Windows desktop/offline edition.

SYSTEM SEARCH FLOW

User Query
↓
Local GCRB Catalog Database
↓
Results Found?
↓
YES → Display Results
↓
Optional Search Online

If no result:
↓
Search Approved Online Sources
↓
Display Temporary Online Results
↓
Preview
↓
Authorized Import
↓
GCRB Database
↓
Available Locally

IMPORTANT SOURCE RULE

Do NOT tightly couple the application to:

TehCat

777Parts

or any individual external website.

Build a modular connector architecture.

External sources may later include:

Official OEM APIs

Authorized catalog APIs

Permitted public catalog endpoints

Licensed data

Authorized technical databases

Publicly permitted catalog pages

Uploaded PDF manuals

CSV files

Excel-derived files

Authorized feeds

Internal المؤسسة files

Do NOT implement:

Paywall bypass

Subscription bypass

Authentication bypass

CAPTCHA bypass

Protected data extraction

Unauthorized scraping

PRODUCT SCOPE

The system is exclusively for heavy equipment related to:

Roads

Bridges

Construction

Earthmoving

Mining

Road maintenance

Asphalt works

Heavy lifting

Industrial heavy equipment

DO NOT include agricultural equipment.

PRIMARY MANUFACTURERS

Seed the application with:

Caterpillar

Komatsu

Volvo Construction Equipment

Hitachi Construction Machinery

Hyundai Construction Equipment

Develon / Doosan

Kobelco

JCB

CASE Construction

Liebherr

SANY

XCMG

The admin must be able to add unlimited manufacturers later.

PRIMARY EQUIPMENT TYPES

Excavator

Mini Excavator

Bulldozer

Wheel Loader

Backhoe Loader

Motor Grader

Dump Truck

Articulated Dump Truck

Mining Truck

Pipelayer

Skid Steer

Compact Track Loader

Compactor

Road Roller

Asphalt Paver

Cold Planer

Crane

Drilling Equipment

Heavy Equipment Engine

Allow administrators to create additional equipment categories.

TECHNOLOGY STACK

Use:

React

TypeScript

Supabase

PostgreSQL

Supabase Authentication

Supabase Row Level Security

Supabase Storage for MVP

Modular object-storage abstraction

Architecture prepared for Cloudflare R2

Architecture prepared for Amazon S3

PWA-friendly architecture

Desktop-first responsive design

Arabic and English

RTL and LTR

Dark and Light themes

Prepare the codebase for future packaging as a Windows desktop application using Tauri.

Do NOT implement Tauri in this first phase.

BRANDING

Arabic visible application name:

كاتلوج معدات المؤسسة العامة للطرق والجسور

English visible application name:

GCRB Equipment Catalog

Primary visual identity must communicate:

Government/institutional professionalism

Engineering

Heavy machinery

Reliability

Technical precision

Easy information retrieval

Create branding placeholders for:

المؤسسة logo

Application icon

Login-screen logo

Favicon

Header identity

Do not invent or alter an official المؤسسة logo.

Use a replaceable placeholder until the official logo is uploaded.

APPLICATION ARCHITECTURE

Use clear modular layers:

UI Layer
↓
Application Services
↓
Search Service
↓
Catalog Service
↓
Source Connector Service
↓
Import Service
↓
Repository Layer
↓
Supabase/PostgreSQL

Do not access database logic directly from scattered UI components.

MAIN APPLICATION NAVIGATION

Arabic menu:

الرئيسية

البحث

الشركات المصنعة

المعدات

الكتالوجات

قطع الغيار

المصادر الإلكترونية

مركز الاستيراد

التنزيلات

المفضلة

الأخيرة

الإدارة

الإعدادات

Equivalent English navigation:

Dashboard

Search

Manufacturers

Equipment

Catalogs

Parts

Online Sources

Import Center

Downloads

Favorites

Recent

Administration

Settings

TOP BAR

Include:

Universal search

Search scope selector

Arabic/English language switch

Theme switch

Source/database status

Notifications/status

User account menu

DASHBOARD

Build a polished institutional technical dashboard.

The universal search must be the strongest visual element.

Show:

Universal Search

Manufacturers

Equipment categories

Recently opened catalogs

Recently searched parts

Favorites

Recent searches

Number of manufacturers

Number of equipment models

Number of catalogs

Number of indexed parts

Local database status

Online source status

UNIVERSAL SEARCH

Placeholder in English:

Search model, serial number, part number, catalog or description...

Arabic translation:

ابحث بالموديل أو الرقم التسلسلي أو رقم القطعة أو الكتالوج أو الوصف...

Search across:

Manufacturer

Equipment type

Machine model

Model alias

Serial prefix

Serial number

Serial range

Part number

Alternate part number

Normalized part number

Part description

Catalog number

Catalog title

Assembly

Catalog section

SEARCH MODES

Provide:

AUTO
LOCAL
ONLINE

Arabic:

تلقائي
محلي
عبر الإنترنت

Default:
AUTO

AUTO SEARCH BEHAVIOR

Search the local المؤسسة database first.

Display local results immediately.

Indicate whether additional Online Search is available.

Online searches must only run through enabled approved connectors.

Online results must never silently enter the local database.

QUERY NORMALIZATION

Implement technical-code normalization.

Example:

23A-15-00053

and:

23A1500053

must be searchable as equivalent numbers when their normalized values match.

Normalize:

spaces

dashes

separators

letter case

Always preserve original technical numbers exactly as entered.

Also create normalized model-search fields.

SEARCH RESULT GROUPS

Group results into:

Equipment Models

Parts

Catalogs

Assemblies

Online Results

Filters:

Manufacturer

Equipment Type

Model

Catalog Type

Serial Range

Source

Local / Online

Rank results by relevance.

DATABASE ARCHITECTURE

Use UUID primary keys.

Create normalized relational tables.

TABLE: manufacturers

id

name

short_name

slug

logo_url

official_website

active

created_at

updated_at

TABLE: equipment_types

id

name

name_ar

slug

icon

active

created_at

updated_at

TABLE: machine_models

id

manufacturer_id

equipment_type_id

model_name

normalized_model_name

series

description

image_url

production_from

production_to

active

created_at

updated_at

TABLE: machine_aliases

id

machine_model_id

alias

normalized_alias

TABLE: serial_ranges

id

machine_model_id

serial_prefix

serial_from

serial_to

display_value

notes

TABLE: catalogs

id

manufacturer_id

machine_model_id nullable

catalog_number

title

normalized_title

catalog_type

language

revision

publication_date

serial_from

serial_to

source_id nullable

external_source_reference nullable

file_id nullable

page_count

searchable

active

created_at

updated_at

TABLE: catalog_machine_relations

id

catalog_id

machine_model_id

serial_range_id nullable

TABLE: catalog_sections

id

catalog_id

parent_section_id nullable

section_number

title

normalized_title

sort_order

page_from

page_to

TABLE: assemblies

id

catalog_id

section_id nullable

assembly_number

title

normalized_title

diagram_id nullable

sort_order

TABLE: diagrams

id

catalog_id

assembly_id nullable

title

image_url

thumbnail_url

page_number

width

height

TABLE: diagram_hotspots

id

diagram_id

assembly_part_id

position_number

x

y

width

height

Hotspots may remain empty initially but the schema must support them.

TABLE: parts

id

manufacturer_id

primary_part_number

normalized_part_number

description

normalized_description

notes

active

created_at

updated_at

TABLE: part_aliases

id

part_id

alternate_number

normalized_number

alias_type

TABLE: assembly_parts

id

assembly_id

part_id

position_number

quantity

notes

superseded_by_part_id nullable

sort_order

TABLE: part_machine_compatibility

id

part_id

machine_model_id

serial_range_id nullable

notes

TABLE: catalog_files

id

catalog_id

storage_provider

storage_bucket

storage_path

original_filename

mime_type

file_size

checksum

uploaded_at

TABLE: external_sources

id

name

slug

source_type

base_url

connector_key

enabled

priority

requires_authentication

configuration JSONB

created_at

updated_at

TABLE: external_search_results

id

source_id

query

result_type

external_id

title

manufacturer

model

part_number

description

catalog_type

external_url

metadata JSONB

discovered_at

expires_at nullable

Online discovery results must remain temporary until explicitly imported.

TABLE: import_jobs

id

source_id nullable

user_id

import_type

status

total_records

imported_records

skipped_records

failed_records

error_log

created_at

completed_at

TABLE: import_job_items

id

import_job_id

external_reference

entity_type

status

local_entity_id nullable

error_message nullable

TABLE: favorites

id

user_id

entity_type

entity_id

created_at

TABLE: recent_items

id

user_id

entity_type

entity_id

opened_at

TABLE: saved_searches

id

user_id

query

filters JSONB

created_at

TABLE: download_records

id

user_id

catalog_id

status

progress

local_reference nullable

created_at

updated_at

DATABASE REQUIREMENTS

Create:

Proper foreign keys

Unique constraints

Performance indexes

Referential-integrity rules

Sensible delete/archive behavior

created_at fields

updated_at fields

update timestamp triggers where appropriate

SEARCH DATABASE ARCHITECTURE

Prepare performant PostgreSQL search using:

btree indexes where appropriate

PostgreSQL full-text search

pg_trgm where appropriate

Index:

normalized_model_name

machine aliases

serial prefixes

catalog numbers

normalized catalog titles

normalized part numbers

alternate normalized numbers

normalized descriptions

normalized assembly names

Design for future scale of millions of parts.

EXTERNAL SOURCE CONNECTOR ARCHITECTURE

Define a modular conceptual connector interface:

SourceConnector

Functions:

search(query, filters)

getResultDetails(externalId)

getCatalogMetadata(externalId)

canImport(result)

importMetadata(result)

Every external source must have an isolated adapter.

Create initial connector categories:

APIConnector

PublicCatalogConnector

AuthorizedFeedConnector

ManualURLConnector

PDFSourceConnector

For the first build, implement only a clearly marked DEMO connector to validate the architecture.

Do NOT perform unauthorized website scraping.

ONLINE SOURCES ADMINISTRATION

Administrators must be able to:

Create source definition

Edit source

Enable/disable source

Set priority

Select source type

Configure permitted API/public endpoint parameters

Test connection

View last successful request

View errors

View connector status

Never expose secret credentials in frontend JavaScript.

Use secure backend/Edge Function environment variables for future source credentials.

ONLINE SEARCH WORKFLOW

Example query:

GD511A-1

Step 1:
Search local database.

Step 2:
Display local results.

Step 3:
User selects:

Search Online

Step 4:
Server queries enabled approved connectors.

Step 5:
Normalize results.

Example:

KOMATSU GD511A-1
Parts Catalog

Source:
External Catalog Source

Status:
Online

Actions:

Open Source

Preview Metadata

Import

IMPORT PREVIEW

When an authorized user selects Import, show:

Manufacturer:
Komatsu

Model:
GD511A-1

Equipment Type:
Motor Grader

Serial Range:
10001-UP

Catalog Type:
Parts Catalog

External Source:
Source name

Duplicate check:
Existing matching model found.

Available actions:

Link Existing Model

Create New

Cancel

Import

Never create obvious duplicate manufacturers, models, catalogs or parts.

Use normalized identifiers to detect duplicates.

PDF CATALOG IMPORT

Create a dedicated Import Center.

PDF workflow:

Upload PDF

Select Manufacturer

Select/Create Model

Select Equipment Type

Enter Serial Range

Select Catalog Type

Enter Catalog Number

Enter Revision

Select Language

Save

CATALOG TYPES

Parts Catalog

Service Manual

Workshop Manual

Operation Manual

Hydraulic Manual

Electrical Manual

Engine Manual

Technical Manual

Other

Do NOT store PDF binary content directly in PostgreSQL.

Store files in object storage.

CATALOG LIBRARY

Allow users to browse:

Manufacturer
↓
Equipment Type
↓
Model
↓
Serial Range
↓
Catalog

Example:

Komatsu
↓
Motor Grader
↓
GD511A-1
↓
10001-UP
↓
Parts Catalog

PDF VIEWER

Create an integrated technical document viewer.

Layout:

LEFT PANEL

Table of contents

Page thumbnails

CENTER

PDF/document page

RIGHT PANEL

Contextual information

Toolbar:

Previous

Next

Page number

Zoom in

Zoom out

Fit width

Fit page

Search

Fullscreen

Favorite

Download

Prepare support for:

Last opened page

Bookmarks

Recent documents

PART PAGE

Example:

KOMATSU

23A-15-00053

TRANSMISSION ASS'Y

Display:

Part number

Description

Manufacturer

Alternate numbers

Compatible models

Serial ranges

Assemblies

Catalogs containing this part

Replacement/supersession information

Related parts

Actions:

Copy Part Number

Open Catalog

Open Assembly

Favorite

MODEL PAGE

Example:

KOMATSU
GD511A-1
Motor Grader

Tabs:

Overview

Catalogs

Parts

Assemblies

Serial Ranges

Display:

Manufacturer

Equipment type

Model

Series

Model aliases

Serial ranges

Related catalogs

Related parts

ASSEMBLY / EXPLODED DIAGRAM PAGE

Display:

Exploded diagram +
Parts list

Parts table:

Position

Part Number

Description

Quantity

Notes

Future interaction architecture:

Click parts-table row
→ highlight corresponding diagram hotspot.

Click diagram hotspot
→ select corresponding parts row.

Do not require hotspot coordinates for MVP.

MANUFACTURER PAGE

Display:

Logo

Manufacturer name

Equipment categories

Models

Number of catalogs

Number of indexed parts

Provide manufacturer-specific search.

USER AUTHENTICATION

Use Supabase Authentication.

Roles:

system_admin
catalog_manager
technical_user
viewer

SYSTEM ADMIN

Full system access:

Users

Roles

Sources

Catalogs

Equipment

Parts

System settings

CATALOG MANAGER

Can manage:

Manufacturers

Equipment

Models

Serial ranges

Catalogs

Parts

Imports

Technical files

Cannot modify critical system-security settings.

TECHNICAL USER

Can:

Search

Open catalogs

View parts

Use online search

Save favorites

Access recent history

Download permitted catalogs

VIEWER

Read-only permitted technical access.

Implement all permissions using Supabase RLS.

Do NOT depend only on hiding buttons in the UI.

ADMINISTRATION

Create administration modules:

Manufacturers

Equipment Types

Machine Models

Serial Ranges

Catalogs

Catalog Sections

Assemblies

Parts

Catalog Files

Online Sources

Import Jobs

Users

Roles

System Settings

Support:

Add

Edit

Archive

Search

Filters

Server-side pagination

Bulk operations where safe

STORAGE ARCHITECTURE

MVP:
Supabase Storage.

Logical buckets:

catalogs
diagrams
thumbnails
manufacturer-logos
machine-images

Future:

Cloudflare R2
Amazon S3
Desktop Local Storage

Create a FileStorageService abstraction.

Do not scatter Supabase Storage logic across UI components.

FUTURE WINDOWS APPLICATION

Prepare architecture for:

React UI +
Tauri +
SQLite +
Local Catalog Files +
Central Supabase Synchronization

Create abstraction interfaces:

FileStorageService

DownloadService

LocalCacheService

SearchRepository

SettingsService

SyncService

Do NOT implement Tauri now.

FUTURE OFFLINE MODE

Future desktop workflow:

User selects:
Download Catalog

Desktop application downloads:

PDF/manual

Catalog metadata

Related diagrams

Required search index data

The catalog can then operate without an internet connection.

Do not implement full desktop offline synchronization during this initial Lovable phase.

ARABIC AND ENGLISH

Arabic must be a first-class interface, not a later patch.

Build complete i18n infrastructure.

Arabic:

RTL layout

Arabic navigation

Arabic UI text

Correct table alignment

Technical identifiers such as:

GD511A-1
23A-15-00053

must retain natural LTR technical formatting even inside Arabic pages.

English interface must use LTR automatically.

DESIGN SYSTEM

Create a serious professional technical system appropriate for:

المؤسسة العامة للطرق والجسور

Style:

Engineering

Institutional

Modern

Technical

Professional

High information density

Easy to use

Avoid:

Playful SaaS appearance

Excessive gradients

Excessively rounded cards

Decorative clutter

Marketing-style landing-page design

Unnecessary animation

Use:

Clear technical typography

Professional tables

Strong information hierarchy

Restrained borders

Subtle shadows

Good whitespace

Industrial blue/graphite neutral styling

Clear state/status indicators

Professional technical icons

The application should feel like a modern, easier-to-use alternative to traditional OEM EPC systems.

LOGIN SCREEN

Create a professional login page.

Display:

Official logo placeholder

كاتلوج معدات المؤسسة العامة للطرق والجسور

Fields:

Username/email according to authentication configuration

Password

Include application version in a subtle footer.

Do not make the login screen look like a commercial SaaS website.

RESPONSIVE DESIGN

Priority:

Desktop workstation

Laptop

Tablet

Mobile

Desktop should maximize available screen space.

Use a collapsible sidebar.

PERFORMANCE

Implement:

Server-side pagination

Debounced search

Database indexes

Efficient query caching

Lazy loading

Code splitting

Optimized thumbnails

Virtualized tables when needed

Architecture target:

Millions of parts

Tens of thousands of catalogs

Thousands of equipment models

DEMO / SEED DATA

Manufacturers:

Caterpillar
Komatsu
Volvo CE
Hitachi
Hyundai
Develon
Kobelco
JCB
CASE
Liebherr
SANY
XCMG

Create equipment categories listed above.

Create demo equipment:

Manufacturer:
Komatsu

Equipment:
Motor Grader

Model:
GD511A-1

Serial Range:
10001-UP

Create demo part:

Part Number:
23A-15-00053

Normalized:
23A1500053

Description:
TRANSMISSION ASS'Y

Create a DEMO Online Source Connector.

It must produce clearly labeled demo online-search results solely to validate:

Online Search

Preview

Import

Duplicate detection

Never present demo data as real live external data.

FIRST BUILD ORDER

Build in this exact order:

Application branding and shell

Login and authentication

Database schema

RLS and roles

Dashboard

Universal local search

Manufacturers

Equipment types

Models

Serial ranges

Parts

Catalog library

PDF upload

Integrated PDF viewer

Online-source architecture

Demo online connector

Online-search interface

Import preview

Administration

Arabic RTL

English LTR

Responsive verification

Database consistency

TypeScript validation

Final functional validation

DO NOT BUILD YET

Do not implement these during the initial foundation:

AI technical assistant

Automatic OCR

Automatic PDF part extraction

Automatic exploded-diagram recognition

Protected website scraping

Payment system

Public subscription system

E-commerce marketplace

Tauri Windows executable

Keep the architecture ready for these future phases when relevant.

QUALITY RULES

No permanent mock APIs except explicitly marked demo connector.

Use real Supabase flows after connection.

Avoid duplicate database tables.

Avoid duplicated components.

Keep architecture modular.

Resolve TypeScript errors.

Implement meaningful loading states.

Implement empty states.

Implement error states.

Add confirmations to destructive actions.

Generate reproducible database migrations.

Verify all RLS policies.

Verify Arabic RTL.

Verify English LTR.

Verify responsive layouts.

Do not simplify critical database relationships just to finish faster.

FINAL ACCEPTANCE TEST

The first build is successful only when:

Login works.

Application displays the official name:
كاتلوج معدات المؤسسة العامة للطرق والجسور

English mode displays:
GCRB Equipment Catalog

User can search local data.

GD511A-1 returns the demo equipment.

23A-15-00053 returns the demo part.

23A1500053 returns the same relevant part.

Serial search works against stored serial data.

Online Search mode is available.

Demo connector returns clearly marked temporary results.

Authorized user can preview an online result.

Authorized user can import a permitted demo result.

Imported record becomes locally searchable.

Admin can create manufacturers.

Admin can create equipment models.

Admin can define serial ranges.

Admin can create parts.

Admin can upload PDF catalogs.

PDF opens in the integrated viewer.

Favorites work.

Recent history works.

RLS correctly enforces roles.

Arabic RTL works correctly.

English LTR works correctly.

Desktop interface is professional and suitable for المؤسسة.

Database schema and TypeScript application types are consistent.

No unauthorized external scraping is implemented.

Architecture is ready for approved real online sources.

Architecture is ready for future Windows/Tauri packaging.

No visible reference to "HeavyCat Pro" remains anywhere.

Do not proceed to AI, OCR, automatic extraction or desktop packaging until this foundation is stable and verified.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c427a7b0-15a7-4d3e-abda-9cbb4ebd06b7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

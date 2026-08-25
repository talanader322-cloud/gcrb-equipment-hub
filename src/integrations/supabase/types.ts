export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      assemblies: {
        Row: {
          assembly_number: string | null
          catalog_id: string
          created_at: string
          diagram_id: string | null
          id: string
          normalized_title: string | null
          section_id: string | null
          sort_order: number
          title: string
        }
        Insert: {
          assembly_number?: string | null
          catalog_id: string
          created_at?: string
          diagram_id?: string | null
          id?: string
          normalized_title?: string | null
          section_id?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          assembly_number?: string | null
          catalog_id?: string
          created_at?: string
          diagram_id?: string | null
          id?: string
          normalized_title?: string | null
          section_id?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assemblies_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_diagram_fk"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "diagrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assemblies_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "catalog_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      assembly_parts: {
        Row: {
          assembly_id: string
          id: string
          notes: string | null
          part_id: string
          position_number: string | null
          quantity: number | null
          sort_order: number
          superseded_by_part_id: string | null
        }
        Insert: {
          assembly_id: string
          id?: string
          notes?: string | null
          part_id: string
          position_number?: string | null
          quantity?: number | null
          sort_order?: number
          superseded_by_part_id?: string | null
        }
        Update: {
          assembly_id?: string
          id?: string
          notes?: string | null
          part_id?: string
          position_number?: string | null
          quantity?: number | null
          sort_order?: number
          superseded_by_part_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assembly_parts_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assembly_parts_superseded_by_part_id_fkey"
            columns: ["superseded_by_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_files: {
        Row: {
          catalog_id: string
          checksum: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          original_filename: string | null
          storage_bucket: string
          storage_path: string
          storage_provider: string
          uploaded_at: string
        }
        Insert: {
          catalog_id: string
          checksum?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          storage_bucket?: string
          storage_path: string
          storage_provider?: string
          uploaded_at?: string
        }
        Update: {
          catalog_id?: string
          checksum?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          storage_bucket?: string
          storage_path?: string
          storage_provider?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_files_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_machine_relations: {
        Row: {
          catalog_id: string
          id: string
          machine_model_id: string
          serial_range_id: string | null
        }
        Insert: {
          catalog_id: string
          id?: string
          machine_model_id: string
          serial_range_id?: string | null
        }
        Update: {
          catalog_id?: string
          id?: string
          machine_model_id?: string
          serial_range_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_machine_relations_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_machine_relations_machine_model_id_fkey"
            columns: ["machine_model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_machine_relations_serial_range_id_fkey"
            columns: ["serial_range_id"]
            isOneToOne: false
            referencedRelation: "serial_ranges"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sections: {
        Row: {
          catalog_id: string
          id: string
          normalized_title: string | null
          page_from: number | null
          page_to: number | null
          parent_section_id: string | null
          section_number: string | null
          sort_order: number
          title: string
        }
        Insert: {
          catalog_id: string
          id?: string
          normalized_title?: string | null
          page_from?: number | null
          page_to?: number | null
          parent_section_id?: string | null
          section_number?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          catalog_id?: string
          id?: string
          normalized_title?: string | null
          page_from?: number | null
          page_to?: number | null
          parent_section_id?: string | null
          section_number?: string | null
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_sections_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "catalog_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          active: boolean
          catalog_number: string | null
          catalog_type: string
          created_at: string
          external_source_reference: string | null
          file_id: string | null
          id: string
          language: string
          machine_model_id: string | null
          manufacturer_id: string
          normalized_catalog_number: string | null
          normalized_title: string | null
          page_count: number | null
          publication_date: string | null
          revision: string | null
          searchable: boolean
          serial_from: string | null
          serial_to: string | null
          source_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_number?: string | null
          catalog_type?: string
          created_at?: string
          external_source_reference?: string | null
          file_id?: string | null
          id?: string
          language?: string
          machine_model_id?: string | null
          manufacturer_id: string
          normalized_catalog_number?: string | null
          normalized_title?: string | null
          page_count?: number | null
          publication_date?: string | null
          revision?: string | null
          searchable?: boolean
          serial_from?: string | null
          serial_to?: string | null
          source_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_number?: string | null
          catalog_type?: string
          created_at?: string
          external_source_reference?: string | null
          file_id?: string | null
          id?: string
          language?: string
          machine_model_id?: string | null
          manufacturer_id?: string
          normalized_catalog_number?: string | null
          normalized_title?: string | null
          page_count?: number | null
          publication_date?: string | null
          revision?: string | null
          searchable?: boolean
          serial_from?: string | null
          serial_to?: string | null
          source_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogs_file_fk"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "catalog_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogs_machine_model_id_fkey"
            columns: ["machine_model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogs_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      diagram_hotspots: {
        Row: {
          assembly_part_id: string
          diagram_id: string
          height: number
          id: string
          position_number: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          assembly_part_id: string
          diagram_id: string
          height?: number
          id?: string
          position_number?: string | null
          width?: number
          x?: number
          y?: number
        }
        Update: {
          assembly_part_id?: string
          diagram_id?: string
          height?: number
          id?: string
          position_number?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "diagram_hotspots_assembly_part_id_fkey"
            columns: ["assembly_part_id"]
            isOneToOne: false
            referencedRelation: "assembly_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagram_hotspots_diagram_id_fkey"
            columns: ["diagram_id"]
            isOneToOne: false
            referencedRelation: "diagrams"
            referencedColumns: ["id"]
          },
        ]
      }
      diagrams: {
        Row: {
          assembly_id: string | null
          catalog_id: string
          height: number | null
          id: string
          image_url: string | null
          page_number: number | null
          thumbnail_url: string | null
          title: string | null
          width: number | null
        }
        Insert: {
          assembly_id?: string | null
          catalog_id: string
          height?: number | null
          id?: string
          image_url?: string | null
          page_number?: number | null
          thumbnail_url?: string | null
          title?: string | null
          width?: number | null
        }
        Update: {
          assembly_id?: string | null
          catalog_id?: string
          height?: number | null
          id?: string
          image_url?: string | null
          page_number?: number | null
          thumbnail_url?: string | null
          title?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diagrams_assembly_id_fkey"
            columns: ["assembly_id"]
            isOneToOne: false
            referencedRelation: "assemblies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagrams_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      download_records: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          local_reference: string | null
          progress: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          local_reference?: string | null
          progress?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          local_reference?: string | null
          progress?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "download_records_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_types: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          id: string
          name: string
          name_ar: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          name_ar?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_search_results: {
        Row: {
          catalog_type: string | null
          description: string | null
          discovered_at: string
          expires_at: string | null
          external_id: string
          external_url: string | null
          id: string
          manufacturer: string | null
          metadata: Json
          model: string | null
          part_number: string | null
          query: string
          result_type: string
          source_id: string
          title: string | null
        }
        Insert: {
          catalog_type?: string | null
          description?: string | null
          discovered_at?: string
          expires_at?: string | null
          external_id: string
          external_url?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json
          model?: string | null
          part_number?: string | null
          query: string
          result_type?: string
          source_id: string
          title?: string | null
        }
        Update: {
          catalog_type?: string | null
          description?: string | null
          discovered_at?: string
          expires_at?: string | null
          external_id?: string
          external_url?: string | null
          id?: string
          manufacturer?: string | null
          metadata?: Json
          model?: string | null
          part_number?: string | null
          query?: string
          result_type?: string
          source_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_search_results_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sources: {
        Row: {
          base_url: string | null
          configuration: Json
          connector_key: string
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_success_at: string | null
          name: string
          priority: number
          requires_authentication: boolean
          slug: string
          source_type: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          configuration?: Json
          connector_key: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          name: string
          priority?: number
          requires_authentication?: boolean
          slug: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          configuration?: Json
          connector_key?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_success_at?: string | null
          name?: string
          priority?: number
          requires_authentication?: boolean
          slug?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      import_job_items: {
        Row: {
          created_at: string
          entity_type: string
          error_message: string | null
          external_reference: string | null
          id: string
          import_job_id: string
          local_entity_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          error_message?: string | null
          external_reference?: string | null
          id?: string
          import_job_id: string
          local_entity_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          error_message?: string | null
          external_reference?: string | null
          id?: string
          import_job_id?: string
          local_entity_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_items_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_log: string | null
          failed_records: number
          id: string
          import_type: string
          imported_records: number
          skipped_records: number
          source_id: string | null
          status: string
          total_records: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          failed_records?: number
          id?: string
          import_type?: string
          imported_records?: number
          skipped_records?: number
          source_id?: string | null
          status?: string
          total_records?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          failed_records?: number
          id?: string
          import_type?: string
          imported_records?: number
          skipped_records?: number
          source_id?: string | null
          status?: string
          total_records?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "external_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_aliases: {
        Row: {
          alias: string
          id: string
          machine_model_id: string
          normalized_alias: string | null
        }
        Insert: {
          alias: string
          id?: string
          machine_model_id: string
          normalized_alias?: string | null
        }
        Update: {
          alias?: string
          id?: string
          machine_model_id?: string
          normalized_alias?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_aliases_machine_model_id_fkey"
            columns: ["machine_model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_models: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          equipment_type_id: string | null
          id: string
          image_url: string | null
          manufacturer_id: string
          model_name: string
          normalized_model_name: string | null
          production_from: number | null
          production_to: number | null
          series: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          equipment_type_id?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id: string
          model_name: string
          normalized_model_name?: string | null
          production_from?: number | null
          production_to?: number | null
          series?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          equipment_type_id?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id?: string
          model_name?: string
          normalized_model_name?: string | null
          production_from?: number | null
          production_to?: number | null
          series?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_models_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            isOneToOne: false
            referencedRelation: "equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_models_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          official_website: string | null
          short_name: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          official_website?: string | null
          short_name?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          official_website?: string | null
          short_name?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      part_aliases: {
        Row: {
          alias_type: string
          alternate_number: string
          id: string
          normalized_number: string | null
          part_id: string
        }
        Insert: {
          alias_type?: string
          alternate_number: string
          id?: string
          normalized_number?: string | null
          part_id: string
        }
        Update: {
          alias_type?: string
          alternate_number?: string
          id?: string
          normalized_number?: string | null
          part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_aliases_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      part_machine_compatibility: {
        Row: {
          id: string
          machine_model_id: string
          notes: string | null
          part_id: string
          serial_range_id: string | null
        }
        Insert: {
          id?: string
          machine_model_id: string
          notes?: string | null
          part_id: string
          serial_range_id?: string | null
        }
        Update: {
          id?: string
          machine_model_id?: string
          notes?: string | null
          part_id?: string
          serial_range_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_machine_compatibility_machine_model_id_fkey"
            columns: ["machine_model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_machine_compatibility_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_machine_compatibility_serial_range_id_fkey"
            columns: ["serial_range_id"]
            isOneToOne: false
            referencedRelation: "serial_ranges"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          manufacturer_id: string
          normalized_description: string | null
          normalized_part_number: string | null
          notes: string | null
          primary_part_number: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          manufacturer_id: string
          normalized_description?: string | null
          normalized_part_number?: string | null
          notes?: string | null
          primary_part_number: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          manufacturer_id?: string
          normalized_description?: string | null
          normalized_part_number?: string | null
          notes?: string | null
          primary_part_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          locale: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          locale?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      recent_items: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          opened_at: string
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          opened_at?: string
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          opened_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      serial_ranges: {
        Row: {
          created_at: string
          display_value: string | null
          id: string
          machine_model_id: string
          notes: string | null
          serial_from: string | null
          serial_prefix: string | null
          serial_to: string | null
        }
        Insert: {
          created_at?: string
          display_value?: string | null
          id?: string
          machine_model_id: string
          notes?: string | null
          serial_from?: string | null
          serial_prefix?: string | null
          serial_to?: string | null
        }
        Update: {
          created_at?: string
          display_value?: string | null
          id?: string
          machine_model_id?: string
          notes?: string | null
          serial_from?: string | null
          serial_prefix?: string | null
          serial_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serial_ranges_machine_model_id_fkey"
            columns: ["machine_model_id"]
            isOneToOne: false
            referencedRelation: "machine_models"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_catalog: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_code: { Args: { input: string }; Returns: string }
      normalize_text: { Args: { input: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "system_admin" | "catalog_manager" | "technical_user" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["system_admin", "catalog_manager", "technical_user", "viewer"],
    },
  },
} as const

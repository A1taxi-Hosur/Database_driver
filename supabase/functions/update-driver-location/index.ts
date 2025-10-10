const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

import { createClient } from "npm:@supabase/supabase-js@2";

interface Database {
  public: {
    Tables: {
      live_locations: {
        Row: {
          id: string
          user_id: string
          latitude: number
          longitude: number
          heading: number | null
          speed: number | null
          accuracy: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          latitude: number
          longitude: number
          heading?: number | null
          speed?: number | null
          accuracy?: number | null
          updated_at?: string
        }
        Update: {
          latitude?: number
          longitude?: number
          heading?: number | null
          speed?: number | null
          accuracy?: number | null
          updated_at?: string
        }
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    if (req.method === 'POST') {
      return await handleUpdateDriverLocation(supabase, req);
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      },
    );

  } catch (error) {
    console.error('Update Driver Location API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});

async function handleUpdateDriverLocation(supabase: any, req: Request) {
  try {
    const body = await req.json();
    const { 
      user_id, 
      latitude, 
      longitude, 
      heading = null, 
      speed = null, 
      accuracy = null 
    } = body;

    if (!user_id || !latitude || !longitude) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'user_id, latitude, and longitude are required' 
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    const locationData = {
      user_id,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      heading: heading ? parseFloat(heading) : null,
      speed: speed ? parseFloat(speed) : null,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      updated_at: new Date().toISOString()
    };

    // Try to insert first, then update if record exists
    const { data: insertData, error: insertError } = await supabase
      .from('live_locations')
      .insert(locationData)
      .select();

    if (insertError) {
      // If insert fails due to duplicate user_id, try update instead
      if (insertError.code === '23505') {
        const { data: updateData, error: updateError } = await supabase
          .from('live_locations')
          .update({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            heading: locationData.heading,
            speed: locationData.speed,
            accuracy: locationData.accuracy,
            updated_at: locationData.updated_at
          })
          .eq('user_id', user_id)
          .select();

        if (updateError) {
          console.error('Error updating location:', updateError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Failed to update location' 
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500,
            },
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            data: updateData?.[0] || null,
            action: 'updated'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      } else {
        console.error('Error inserting location:', insertError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to insert location' 
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: insertData?.[0] || null,
        action: 'inserted'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error) {
    console.error('Error handling location update:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
}
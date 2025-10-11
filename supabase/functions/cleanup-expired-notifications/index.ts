import { createClient } from 'npm:@supabase/supabase-js@2.56.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('=== CLEANING UP EXPIRED NOTIFICATIONS ===');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Delete expired ride request notifications
    const { data: deletedNotifications, error: deleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('type', 'ride_request')
      .eq('status', 'unread')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (deleteError) {
      console.error('Error deleting expired notifications:', deleteError);
      throw deleteError;
    }

    const deletedCount = deletedNotifications?.length || 0;
    console.log(`✅ Deleted ${deletedCount} expired ride request notifications`);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount,
        message: `Cleaned up ${deletedCount} expired notifications`,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('❌ Exception in cleanup:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
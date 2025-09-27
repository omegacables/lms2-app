import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function PUT(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { videoId } = params;
    const body = await request.json();
    const { chapterId } = body;

    const { data, error } = await supabase
      .from('videos')
      .update({
        chapter_id: chapterId,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId)
      .select()
      .single();

    if (error) {
      console.error('Error assigning video to chapter:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
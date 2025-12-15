-- Add reply_to column to messages table
ALTER TABLE public.messages 
ADD COLUMN reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Create index for faster reply lookups
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages(reply_to);

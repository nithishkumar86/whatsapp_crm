import { redirect } from 'next/navigation';

/**
 * /whatsapp has no content of its own — it lands on the Chat route.
 */
export default function WhatsAppIndex() {
  redirect('/main/chat');
}

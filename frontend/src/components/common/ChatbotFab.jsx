import { useState } from "react"
import { MessageCircle } from "lucide-react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Chatbot } from "@/components/Chatbot"

export function ChatbotFab({ context }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-colors hover:bg-primary/90 print:hidden"
      >
        <MessageCircle className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">Scheduler Assistant</SheetTitle>
          <Chatbot
            isOpen={open}
            onClose={() => setOpen(false)}
            context={context}
            floating={false}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

export default ChatbotFab

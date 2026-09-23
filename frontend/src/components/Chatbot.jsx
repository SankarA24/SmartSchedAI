import { useState, useEffect, useRef } from "react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, X, Bot } from "lucide-react";
import ReactMarkdown from 'react-markdown'; // Import the markdown renderer

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {object} [props.context] — page context forwarded to `/api/ai/chat`
 * @param {boolean} [props.floating=true] — keep the self-positioned floating
 *   card (the pre-U2 shell) so callers that render `<Chatbot>` directly in a
 *   page body still get a fixed panel. `ChatbotFab` hosts the panel inside a
 *   `<Sheet>` and passes `floating={false}` so it fills the sheet instead.
 */
export function Chatbot({ isOpen, onClose, context, floating = true }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Add a welcome message when the chat opens for the first time
  useEffect(() => {
    if (isOpen) {
      setMessages([
        { sender: 'bot', text: 'Hello! How can I help you with your schedule today?' }
      ]);
    }
  }, [isOpen]);

  // Automatically scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = { sender: 'user', text: inputValue };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue("");
    setIsLoading(true);

    try {
      // API call to your backend AI chat route
      const res = await api.post("/ai/chat", {
        message: currentInput,
        context: context, // Pass the dashboard context to the AI
      });

      const botMessage = { sender: 'bot', text: res.data.response };
      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error("Chatbot API error:", error);
      const errorMessage = { sender: 'bot', text: "Sorry, I'm having trouble connecting. Please try again later." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Do not render the component if it's not open
  if (!isOpen) {
    return null;
  }

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 bg-card py-0 animate-in fade-in duration-200",
        floating
          ? "fixed bottom-24 right-8 z-50 h-[60vh] w-96 overflow-hidden rounded-2xl border border-border shadow-2xl"
          : "h-full rounded-none border-0 shadow-none"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-1.5 border-b border-border p-4">
        <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
                <Bot className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg font-semibold text-foreground">Scheduler Assistant</CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`prose prose-sm max-w-[80%] p-3 rounded-xl ${msg.sender === 'user' ? 'bg-primary text-primary-foreground prose-invert' : 'bg-muted text-foreground'}`}>
              {/* Use ReactMarkdown to render the response */}
              {/* eslint-disable-next-line no-unused-vars -- strip react-markdown's `node` prop before spreading onto <p> */}
              <ReactMarkdown components={{p: ({node, ...props}) => <p className="my-0" {...props} />}}>
                {msg.text}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start items-end gap-2">
                 <div className="max-w-[80%] p-3 rounded-xl bg-muted text-foreground">
                    <p className="text-sm animate-pulse">Thinking...</p>
                 </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </CardContent>
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about schedules..."
            autoComplete="off"
            disabled={isLoading}
            className="h-10 rounded-full"
          />
          <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()} className="rounded-full">
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
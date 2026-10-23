"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WIDTH = 600;
const HEIGHT = 200;

/**
 * Canvas signature stored as a PNG data URL in a hidden input. Keyboard users
 * can type their name instead, which is drawn on the canvas.
 */
export function SignaturePad({ name = "signature", label = "Signature" }: { name?: string; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [value, setValue] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function save() {
    setValue(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, WIDTH, HEIGHT);
    setValue("");
    setTyped("");
  }

  function drawTyped(text: string) {
    setTyped(text);
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!text.trim()) {
      setValue("");
      return;
    }
    context.font = "italic 56px 'Segoe Script', 'Brush Script MT', cursive";
    context.fillStyle = "#111827";
    context.textBaseline = "middle";
    context.fillText(text, 24, HEIGHT / 2, WIDTH - 48);
    save();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Zone de signature : signez avec le doigt, un stylet ou la souris"
        className="bg-background w-full touch-none rounded-md border-2 border-dashed"
        onPointerDown={(event) => {
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const context = canvasRef.current!.getContext("2d")!;
          const { x, y } = point(event);
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + 0.1, y + 0.1);
          context.stroke();
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const context = canvasRef.current!.getContext("2d")!;
          const { x, y } = point(event);
          context.lineTo(x, y);
          context.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          save();
        }}
        onPointerLeave={() => {
          if (drawing.current) save();
          drawing.current = false;
        }}
      />
      <input type="hidden" name={name} value={value} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={`${name}-typed`}>Ou saisissez votre nom pour signer</Label>
          <Input
            id={`${name}-typed`}
            value={typed}
            onChange={(event) => drawTyped(event.target.value)}
            autoComplete="name"
          />
        </div>
        <Button type="button" variant="ghost" onClick={clear}>
          <Eraser aria-hidden="true" />
          Effacer
        </Button>
      </div>
    </div>
  );
}

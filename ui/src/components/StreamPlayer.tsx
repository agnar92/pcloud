import { useEffect, useRef } from "react";

export default function VideoStream() {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    import("../lib/webrtc").then((mod) => {
      mod.setVideoElement(videoRef.current);
      // videoRef.current?.blur();
    });
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        tabIndex={-1}     // ✅ prevent focus
        onMouseDown={(e) => e.preventDefault()} // ✅ block focus grab
        className="w-full h-full object-contain bg-black"
      />
      <audio ref={audioRef} autoPlay />
    </>
  );
}

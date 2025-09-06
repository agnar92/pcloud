import { forwardRef, useRef } from "react";

const VideoStream = forwardRef<HTMLVideoElement>((_props, ref) => {
  const audioRef = useRef(null);

  return (
    <>
      <video
        ref={ref}
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
);

export default VideoStream;

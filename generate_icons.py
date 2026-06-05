import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Draw at 4x resolution for high-quality antialiasing
    scale = 4
    canvas_size = size * scale
    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    if size == 16:
        # Dedicated sharp Stopwatch design for 16x16 toolbar size (with larger clock face)
        margin = 4 # 1 physical pixel margin
        rect_start = margin
        rect_end = canvas_size - margin
        radius = 12 # 3 physical pixels corner radius
        
        # 1. Rounded rectangle background (solid crimson red)
        draw.rounded_rectangle(
            [rect_start, rect_start, rect_end, rect_end],
            radius=radius,
            fill=(255, 46, 85, 255)
        )
        
        # 2. White stopwatch icon details (enlarged clock face)
        bx = canvas_size / 2
        by = canvas_size / 2 + 3 # shift down slightly to center the whole watch (pusher + circle)
        br = 24 # radius (6 physical pixels) - enlarged from 18 to fill the 14x14 icon area
        border_w = 4 # 1 physical pixel outline
        
        # Stopwatch body outline
        draw.ellipse([bx - br, by - br, bx + br, by + br], outline=(255, 255, 255, 255), width=border_w)
        
        # Top crown pusher (2x1.5 physical pixels)
        pusher_w = 8
        pusher_h = 6
        draw.rectangle([bx - pusher_w/2, by - br - pusher_h, bx + pusher_w/2, by - br], fill=(255, 255, 255, 255))
        
        # Hand pointing at 2 o'clock (45 degrees / -45 degrees)
        hand_len = br - 4
        hx = bx + hand_len * 0.707
        hy = by - hand_len * 0.707
        draw.line([bx, by, hx, hy], fill=(255, 255, 255, 255), width=3)
        
        # Center dot
        draw.ellipse([bx - 2, by - 2, bx + 2, by + 2], fill=(255, 255, 255, 255))
        
    else:
        # Standard Play + Stopwatch hybrid design for larger icons (32, 48, 128)
        margin = canvas_size * 0.0625
        rect_start = margin
        rect_end = canvas_size - margin
        radius = canvas_size * 0.1875
        
        # 1. Rounded rectangle background with red gradient
        for y in range(int(rect_start), int(rect_end)):
            t = (y - rect_start) / (rect_end - rect_start)
            r = int(255 * (1 - t) + 179 * t)
            g = int(46 * (1 - t) + 0 * t)
            b = int(85 * (1 - t) + 30 * t)
            draw.line([(rect_start, y), (rect_end, y)], fill=(r, g, b, 255))
        
        # Create mask for rounded corners
        mask = Image.new('L', (canvas_size, canvas_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle(
            [rect_start, rect_start, rect_end, rect_end],
            radius=radius,
            fill=255
        )
        
        # Apply mask
        gradient_img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        gradient_img.paste(img, (0, 0), mask=mask)
        draw = ImageDraw.Draw(gradient_img)
        
        # 2. Draw white Play triangle in center
        cx = canvas_size * 0.421875
        cy = canvas_size * 0.5
        w = canvas_size * 0.375
        h = canvas_size * 0.4375
        
        p1 = (cx - w/2, cy - h/2)
        p2 = (cx - w/2, cy + h/2)
        p3 = (cx + w/2, cy)
        draw.polygon([p1, p2, p3], fill=(255, 255, 255, 255))
        
        # 3. Draw stopwatch overlay badge in bottom-right corner
        bx = canvas_size * 0.6875
        by = canvas_size * 0.6875
        br = canvas_size * 0.171875
        border_w = max(1, int(canvas_size * 0.0234375))
        
        # Circular container/shadow
        draw.ellipse([bx - br, by - br, bx + br, by + br], fill=(24, 24, 27, 255))
        draw.ellipse([bx - br, by - br, bx + br, by + br], outline=(255, 255, 255, 255), width=border_w)
        
        # Top crown/pusher
        pusher_w = canvas_size * 0.0625
        pusher_h = canvas_size * 0.0390625
        draw.rectangle([bx - pusher_w/2, by - br - pusher_h, bx + pusher_w/2, by - br], fill=(255, 255, 255, 255))
        
        # Side button pusher
        px = bx + (br + border_w/2) * 0.707
        py = by - (br + border_w/2) * 0.707
        pw = canvas_size * 0.046875
        draw.ellipse([px - pw/2, py - pw/2, px + pw/2, py + pw/2], fill=(255, 255, 255, 255))

        # Stopwatch indicator hand (at -30 degrees)
        hand_len = canvas_size * 0.1015625
        hx = bx + hand_len * 0.866
        hy = by + hand_len * -0.5
        hand_w = max(1, int(canvas_size * 0.0234375))
        draw.line([bx, by, hx, hy], fill=(255, 255, 255, 255), width=hand_w, joint="round")
        
        # Center dot
        dot_r = max(1, int(canvas_size * 0.01953125))
        draw.ellipse([bx - dot_r, by - dot_r, bx + dot_r, by + dot_r], fill=(255, 255, 255, 255))
        
        img = gradient_img
    
    # Downsample
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

# Make icons directory
os.makedirs('icons', exist_ok=True)

# Generate sizes natively
for s in [16, 48, 128]:
    icon = create_icon(s)
    icon.save(f'icons/icon-{s}.png', 'PNG')
    print(f"Created icons/icon-{s}.png")

# Also generate favicon.png natively (32x32)
favicon = create_icon(32)
favicon.save('icons/favicon.png', 'PNG')
print("Created icons/favicon.png")

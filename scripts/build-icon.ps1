$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$assetDirectory = Join-Path $taskRoot 'assets'
$iconFile = Join-Path $assetDirectory 'aegis.ico'
$buffers = [System.Collections.Generic.List[byte[]]]::new()
$sizes = @(16, 32, 48, 64, 128, 256)
foreach ($size in $sizes) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform($size / 256.0, $size / 256.0)
  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#121e28'))
  $fill = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1c3547'))
  $border = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#86b9d3'), 10)
  $pulse = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#ee9a57'), 12)
  $pulse.StartCap = $pulse.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pulse.LineJoin = $border.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.FillRectangle($background, 0, 0, 256, 256)
  $shield = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $shield.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(128,34), [System.Drawing.PointF]::new(210,64), [System.Drawing.PointF]::new(199,151)))
  $shield.AddBezier(199,151,183,195,156,210,128,225)
  $shield.AddBezier(128,225,100,210,73,195,57,151)
  $shield.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(57,151),[System.Drawing.PointF]::new(46,64),[System.Drawing.PointF]::new(128,34)))
  $shield.CloseFigure()
  $graphics.FillPath($fill, $shield)
  $graphics.DrawPath($border, $shield)
  $graphics.DrawLines($pulse, [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(67,130),[System.Drawing.PointF]::new(96,130),[System.Drawing.PointF]::new(110,99),[System.Drawing.PointF]::new(132,160),[System.Drawing.PointF]::new(148,120),[System.Drawing.PointF]::new(189,120)))
  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $buffers.Add($stream.ToArray())
  if ($size -eq 256) { [System.IO.File]::WriteAllBytes((Join-Path $assetDirectory 'aegis.png'), $stream.ToArray()) }
  $stream.Dispose(); $shield.Dispose(); $pulse.Dispose(); $border.Dispose(); $fill.Dispose(); $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$output = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($output)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Length)
$offset = 6 + 16 * $sizes.Length
for ($index = 0; $index -lt $sizes.Length; $index++) {
  $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
  $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$buffers[$index].Length); $writer.Write([uint32]$offset)
  $offset += $buffers[$index].Length
}
foreach ($buffer in $buffers) { $writer.Write($buffer) }
$writer.Flush()
[System.IO.File]::WriteAllBytes($iconFile, $output.ToArray())
$writer.Dispose(); $output.Dispose()
Write-Output "AEGIS icon: $iconFile"

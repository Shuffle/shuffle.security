import gb from '@/assets/region-flags/gb.png.asset.json';
import ca from '@/assets/region-flags/ca.png.asset.json';
import us from '@/assets/region-flags/us.png.asset.json';
import eu from '@/assets/region-flags/eu.png.asset.json';
import de from '@/assets/region-flags/de.png.asset.json';
import au from '@/assets/region-flags/au.png.asset.json';

const flags: Record<string, string> = {
  UK: gb.url,
  CA: ca.url,
  US: us.url,
  EU: eu.url,
  'EU-2': eu.url,
  DE: de.url,
  AUS: au.url,
};

export function RegionFlagImage({ code }: { code: string }) {
  const src = flags[code];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={`${code} region flag`}
      width={20}
      height={14}
      className="block h-[14px] w-5 shrink-0 object-contain"
    />
  );
}
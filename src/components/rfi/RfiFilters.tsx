import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RFI_DISCIPLINES, RFI_TEAM_TYPES, type RfiDiscipline, type RfiTeamType } from "@/types/rfi";

interface Props {
  teamType: RfiTeamType | "ALL";
  discipline: RfiDiscipline | "ALL";
  onTeamTypeChange: (value: RfiTeamType | "ALL") => void;
  onDisciplineChange: (value: RfiDiscipline | "ALL") => void;
}

export const RfiFilters = ({ teamType, discipline, onTeamTypeChange, onDisciplineChange }: Props) => {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="w-44 space-y-1.5">
        <Label>Team Type</Label>
        <Select value={teamType} onValueChange={(v) => onTeamTypeChange(v as RfiTeamType | "ALL")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL</SelectItem>
            {RFI_TEAM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-52 space-y-1.5">
        <Label>Discipline</Label>
        <Select value={discipline} onValueChange={(v) => onDisciplineChange(v as RfiDiscipline | "ALL")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ALL</SelectItem>
            {RFI_DISCIPLINES.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};